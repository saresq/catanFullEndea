import * as CONST from "../public/js/const.js"
import { shuffle } from "../public/js/utils.js"
import Player from "./player.js"
import Board from "../public/js/board/board.js"
import BoardShuffler from "../public/js/board/board_shuffler.js"
import IOManager from "./io_manager.js"
import { createDice } from "./dice.js"
import { pickName } from "./bots/names.js"

const ST = CONST.GAME_STATES
/** Bot levels a seat can be given. `tryhard` is listed for the lobby but joins in slice 2. */
export const BOT_LEVELS = CONST.BOT_LEVELS.filter(l => l.available).map(l => l.id)
const NEXT_STATE = {
  [ST.INITIAL_SETUP]: ST.PLAYER_ROLL,
  [ST.PLAYER_ROLL]: ST.PLAYER_ACTIONS,
  [ST.PLAYER_ACTIONS]: ST.PLAYER_ROLL,
  [ST.ROBBER_DROP]: ST.ROBBER_MOVE,
  [ST.ROBBER_MOVE]: ST.PLAYER_ACTIONS,
}

export default class Game {
  /** @type {Board} */ board;
  id; player_count
  #state; #timer; #timer_ends_at = 0; #io_manager; #onGameEnd
  /** pids whose first regular-round roll is still pending (7 is forbidden for them) */
  #first_round_roll_pids = null
  #active_pid = 0
  /** Turn the last connected socket was seen on; drives the abandoned-game reaper */
  #idle_from_turn = 1
  #spectators = new Map() // spectator_id -> Set(sockets)
  config = CONST.GAME_CONFIG
  /** @type {Player[]} */ players = []
  map_changes = []; expected_actions = []; robbing_players = []
  /** @type {{ pid, giving, asking, id, status:('open'|'closed'|'success'|'failed'|'deleted'), rejected:number[] }[]} */
  ongoing_trades = []
  turn = 1; dice_value = 2
  // Adds +20s bonus only once per player's actions turn when they initiate a trade
  turn_trade_time_added = false
  dev_cards = []
  largest_army_pid = -1
  longest_road_pid = -1
  godmode = false
  free_resources_active = false
  end_context = null
  /** Latched before the deferred end so two VP changes in one tick cannot both end the game */
  #ending = false
  /**
   * Optional `({ pid, kind, trade_id? })` hook: a seat has something to do. `kind` is the game
   * state being expected, or 'TRADE_REQ' for a player trade to answer. The bot controller listens
   * here; it must never act inside the call (`#next` is not re-entrant), only schedule.
   */
  onAwaiting = null
  /**
   * Optional `(event)` hook mirroring the public broadcasts: `{ type, ... }` for roll payouts,
   * initial yield, bank and player trades, steals (no card), discards (count only), monopolies,
   * purchases and year of plenty. The bots' card counter listens; nothing hidden goes through it.
   */
  onPublic = null

  get state() { return this.#state }
  set state(s) {
    this.#io_manager.updateState(s, this.active_pid, this.turn)
    this.#state = s
  }
  get active_pid() { return this.#active_pid + 1 }
  set active_pid(pid) {
    if (pid < 1 || pid > this.player_count) { this.turn++ }
    this.#active_pid = (pid - 1) % this.player_count
  }
  get spectators_count() { return this.#spectators.size }
  get ending() { return this.#ending }
  /** Milliseconds left on the running phase timer, 0 when none */
  get timer_left_ms() { return Math.max(0, this.#timer_ends_at && (this.#timer_ends_at - Date.now())) }

  constructor({ id, host, config, io, onGameEnd }) {
    this.host_pid = host?.id
    this.id = id
    this.#setupConfig(config)
    this.#io_manager = new IOManager({ game: this, io })
    this.players[host.id - 1] = new Player(host.id, host.name, {
      onChange: (...params) => this.#onPlayerUpdate(...params),
      onVpChange: (pid, vp) => this.#onPlayerVpChange(pid, vp),
    })
    this.#onGameEnd = onGameEnd
  }

  #setupConfig(config) {
    this.config = Object.assign({}, this.config, config)
    this.player_count = this.config.player_count
    this.dice = createDice(this.config.dice_mode || 'random')
    // Dev card deck & rule defaults depend on player count
    const tier = CONST.playerTier(this.player_count)
    this.dev_cards = shuffle(tier.deck)
    if (!config.hasOwnProperty('win_points')) { this.config.win_points = tier.win_points }
    if (!config.hasOwnProperty('robber_hand_limit')) { this.config.robber_hand_limit = tier.robber_hand_limit }
  }

  join(name, { bot_level } = {}) {
    const joined_players = this.players.filter(p => p?.id)
    if (joined_players.length >= this.player_count) { return }
    const remaining_ids = [...Array(this.player_count).keys()].map(_ => _+1)
      .filter(id => !this.players[id - 1])
    const id = remaining_ids[0]
    const player = new Player(id, name, {
      onChange: (...params) => this.#onPlayerUpdate(...params),
      onVpChange: (pid, vp) => this.#onPlayerVpChange(pid, vp),
    })
    if (bot_level) { player.is_bot = true; player.bot_level = bot_level }

    // Assign an unused color
    const taken_colors = this.players.filter(p => p?.id).map(p => p.color_id)
    if (taken_colors.includes(player.color_id)) {
      const available_colors = [...Array(10).keys()].map(_ => _ + 1)
        .filter(c => !taken_colors.includes(c))
      if (available_colors.length) {
        player.color_id = available_colors[0]
      }
    }

    this.players[id - 1] = player
    this.#io_manager.updateWaitingRoom(player)
    return player
  }

  /** Lobby only: seat a bot in the first free seat. `avoid_names` keeps a name free for a human. */
  addBot(level, { avoid_names = [] } = {}) {
    if (this.state) return
    if (!BOT_LEVELS.includes(level)) return
    const taken = this.players.filter(p => p?.id).map(p => p.name).concat(avoid_names)
    return this.join(pickName(taken), { bot_level: level })
  }

  /** Lobby only, bot seats only: change the level in place, name and colour stay. */
  setBotLevel(pid, level) {
    if (this.state) return
    if (!BOT_LEVELS.includes(level)) return
    const player = this.getPlayer(pid)
    if (!player?.is_bot) return
    player.bot_level = level
    this.#io_manager.updateWaitingRoom(player)
    return player
  }

  /** Lobby only, bot seats only: the seat is free again. */
  removeBot(pid) {
    if (this.state) return
    if (!this.getPlayer(pid)?.is_bot) return
    this.removePlayer(pid)
  }

  /**
   * A bot takes a quit player's seat in a running game: always medium, new name, everything else
   * (colour, pieces, cards, points, achievements) stays. It plays from the seat's next turn.
   */
  takeOverSeat(pid) {
    if (!this.state || this.state === ST.END || this.#ending) return
    const player = this.getPlayer(pid)
    if (!player?.removed) return
    const taken = this.players.filter(p => p?.id).map(p => p.name)
    player.takeOverAsBot(pickName(taken), 'medium')
    this.#io_manager.updateSeatTakenOver(player.toJSON())
    return player
  }

  start() {
    this.config.mapkey = (new BoardShuffler(this.config.mapkey)).shuffle(this.config.map_shuffle)
    this.board = new Board(this.config.mapkey)
    this.state = ST.INITIAL_SETUP
    this.config.timer ? this.setTimer(this.config.strategize_time) : this.#next()
  }

  // ===================
  /** State Management */
  // ===================
  #next() {
    this.clearTimer()
    this.#resolvePendingActions()
    if (this.#isAbandoned()) { return this.#onGameEnd(this.id) }

    if (this.turn < 3) {
      this.#expect({ callback: this.#expectedInitialBuild.bind(this) })
      // A seat that quit still places (at random, by the resolution at the top of the next call),
      // so it ends setup with a full set of pieces and a bot can take it over later.
      if (this.getActivePlayer().removed) { return this.#next() }
      this.#io_manager.requestInitialSetup(this.active_pid, this.turn)
      this.setTimer(this.config.initial_build_time)
      return
    }

    // this.state just started
    switch (this.state) {
      case ST.PLAYER_ROLL:
        this.#expect({ callback: this.#expectedRoll.bind(this) })
        this.config.auto_roll ? this.#next() : this.setTimer(this.config.roll_time)
        break

      case ST.PLAYER_ACTIONS:
        this.#expect({ callback: _ => {
          this.active_pid++
          this.#skipRemovedSeats()
          this.players.forEach(p => p.resetDevCard(this.#isActive(p.id)))
          this.#gotoNextState(); this.ongoing_trades = []
        }})
        // Reset once-per-turn trade bonus flag at the start of each actions phase
        this.turn_trade_time_added = false
        this.setTimer(this.config.player_turn_time)
        break

      case ST.ROBBER_DROP:
        this.robbing_players = []
        this.players.forEach(pl => {
          if (!pl.removed && pl.resource_count > this.config.robber_hand_limit) {
            this.#expect({
              pid: pl.id, drop_count: Math.floor(pl.resource_count / 2),
              callback: this.#expectedRobberDrop.bind(this)
            })
            this.robbing_players.push(pl.id)
          }
        })
        // Start drop timer with a handler that only auto-drops remaining players,
        // then transitions to robber move with a fresh timer.
        this.setTimer(this.config.robber_drop_time, () => {
          const pending = [...this.robbing_players]
          pending.forEach(pid => this.#expectedRobberDrop(pid, { forced: true }))
          // Clear any remaining expected actions from drop phase to avoid double-calls
          this.expected_actions.splice(0, this.expected_actions.length)
        })
        break

      case ST.ROBBER_MOVE:
        this.#expect({ callback: this.#expectedRobberMove.bind(this) })
        this.setTimer(this.config.robber_move_time)
        break
    }
  }

  // EXPECTATIONS & RESOLUTIONS
  // #region ==========================

  #resolvePendingActions() {
    this.expected_actions.forEach(({ type, pid, callback, ...params }) => callback(pid, params))
    this.expected_actions.splice(0, this.expected_actions.length)
  }

  /** Initial Build */
  #expectedInitialBuild(pid, { settlement_loc, road_loc } = {}) {
    let s_id = settlement_loc, r_id = road_loc
    const valid_corners = this.board.getSettlementLocations(-1).map(s => s.id)
    if (!valid_corners.includes(s_id)) { s_id = this.#getRandom(valid_corners) }
    const valid_edges = this.board.findCorner(s_id)?.getEdges(-1)
      .filter(_ => !_.corner1.surroundedBySea() && !_.corner2.surroundedBySea()).map(e => e.id) || []
    if (!valid_edges.includes(r_id)) { r_id = this.#getRandom(valid_edges) }
    // A small hand-made map can run out of legal corners mid-placement. Skip the player rather
    // than throw: this runs inside the turn timer, where an exception takes the whole process
    // (every game on the server) down with it. Board.maxPlayers keeps it from happening at all.
    const placed = s_id !== undefined && r_id !== undefined
    if (placed) {
      this.build(pid, 'S', s_id)
      this.build(pid, 'R', r_id)
    } else {
      console.warn(`[${this.id}] no legal spot left for player ${pid} - map too small for ${this.player_count} players`)
    }
    if (this.turn === 1) {
      this.active_pid < this.player_count ? this.active_pid++ : this.turn++
    } else {
      placed && this.#distributeCornerResources(s_id)
      if (this.active_pid == 1) {
        this.turn++
        // Initialize first-round roll protection for all current players
        this.#first_round_roll_pids = new Set(this.players.filter(p => p?.id && !p.removed).map(p => p.id))
        this.#skipRemovedSeats()
        this.players.forEach(p => p.resetDevCard(this.#isActive(p.id)))
        this.#gotoNextState()
      } else { this.active_pid-- }
    }
  }

  /** Roll Dice */
  #expectedRoll(pid) {
    // Use configured dice engine; apply first-round protection by avoiding total 7
    const hasProtection = this.#first_round_roll_pids instanceof Set && this.#first_round_roll_pids.has(pid)
    const avoidTotals = hasProtection ? [7] : []
    const { d1, d2 } = this.dice.roll(avoidTotals)
    if (hasProtection) {
      // consume protection for this player
      this.#first_round_roll_pids.delete(pid)
      if (!this.#first_round_roll_pids.size) this.#first_round_roll_pids = null
    }
    this.dice_value = [d1, d2]
    this.#io_manager.updateDiceValue(this.dice_value, this.active_pid)
    const dice_total = d1 + d2
    if (dice_total === CONST.ROBBER_ROLL) {
      // Removed seats are never asked to drop, so they must not open the drop phase either
      const drop = this.players.filter(p => !p.removed && p.resource_count > this.config.robber_hand_limit).length
      this.state = drop ? ST.ROBBER_DROP : ST.ROBBER_MOVE
    } else {
      this.#distributeTileResources(dice_total)
      if (this.free_resources_active) { this.#grantFreeResourcesAll() }
      this.#gotoNextState()
    }
  }

  /** Robber Drop Resource */
  #expectedRobberDrop(pid, { drop_count = 0, resources, forced } = {}) {
    const player = this.getPlayer(pid)
    // Only proceed if the player is actually required to drop now
    if (!this.robbing_players.includes(pid)) { return }
    const must_drop = player.resource_count > this.config.robber_hand_limit || drop_count > 0
    if (must_drop) {
      // How many cards should be taken this time (cap to what's available)
      let taking_count = Math.max(drop_count, Math.floor(player.resource_count / 2))
      taking_count = Math.max(0, Math.min(taking_count, player.resource_count))
      let taken_count = 0
      if (resources) {
        // clamp the resources to what the player actually has
        const clamped = {}
        Object.entries(resources).forEach(([k, v]) => {
          if (v > 0 && player.closed_cards?.[k] > 0) {
            const give = Math.min(v, player.closed_cards[k])
            if (give) { clamped[k] = give; taken_count += give }
          }
        })
        if (taken_count) { player.takeCards(clamped) }
      }
      const remaining = taking_count - taken_count
      if (remaining > 0) { player.takeRandomResources(remaining) }
      // The chosen cards are the player's secret; only how many is public
      this.#public({ type: 'discard', pid, count: taken_count + Math.max(0, remaining) })
    }
    const rob_pl_index = this.robbing_players.indexOf(pid)
    if (rob_pl_index >= 0) { this.robbing_players.splice(rob_pl_index, 1) }
    if (!this.robbing_players.length) {
      this.#gotoNextState()
      // Avoid re-entrancy into #next() during resolution loop, unless forced by timeout
      if (!forced) {
        // Cancel the drop timer to avoid racing with the scheduled next
        this.clearTimer()
        setTimeout(() => this.#next(), 0)
      }
    }
  }

  /** Robber Movement */
  #expectedRobberMove(pid, { tile_id, stolen_pid, knight } = {}) {
    const valid_locs = this.board.getRobbableTiles()
    if (!valid_locs.includes(tile_id)) { tile_id = this.#getRandom(valid_locs) }
    const player = this.getPlayer(pid)
    this.board.moveRobber(tile_id)
    this.#io_manager.moveRobber(pid, tile_id)

    // `?.` guards findTile only - without the fallback the whole chain is undefined when the
    // board has no robbable tile, and `.length` throws inside the turn timer, which takes the
    // process down. Same crash a map too small for its players once caused in #expectedInitialBuild.
    const opp_c_pids = this.board.findTile(tile_id)?.getAllCorners()
      .filter(c => c.piece && (c.player_id !== pid)).map(_ => _.player_id) || []
    if (opp_c_pids.length) {
      // Steal
      if (!opp_c_pids.includes(stolen_pid)) { stolen_pid = this.#getRandom(opp_c_pids) }
      const [[stolen_res] = []] = this.getPlayer(stolen_pid).takeRandomResources()
      if (stolen_res) {
        this.#public({ type: 'steal', pid, from: stolen_pid })
        player.giveCards({ [stolen_res]: 1})
        this.players.forEach(p => {
          const send_res = p.id === pid || p.id === stolen_pid
          this.#io_manager.updateStolen_Private(this.getPlayerSocId(p.id), pid, stolen_pid, send_res && stolen_res)
        })
      }
    }
    if (!knight) {
      if (this.free_resources_active) { this.#grantFreeResourcesAll() }
      this.#gotoNextState()
    }
  }
  //#endregion

  // ===================
  //      IO EVENTS
  //#region ===================

  /** Player Online */
  playerOnlineSoc(pid) {
    // Mark player as online/ready, but do not auto-start; host will start the game manually from waiting room
    this.getPlayer(pid).ready = true
  }

  /** Initial Build Locations */
  initialBuildIO(pid, settlement_loc, road_loc) {
    const expected_index = this.expected_actions.findIndex(_ => _.type === ST.INITIAL_SETUP)
    if (expected_index < 0) return
    const { pid: expected_pid, callback } = this.expected_actions[expected_index]
    if (pid && pid === expected_pid) {
      callback(pid, { settlement_loc, road_loc })
      this.expected_actions.splice(expected_index, 1)
      this.#next()
    }
  }

  /** Player Roll Click */
  playerRollIO(pid) {
    // Sockets and bots always say who they are; only that seat, only while a roll is due
    if (pid !== undefined && !(this.#isActive(pid) && this.state === ST.PLAYER_ROLL)) return
    this.#next()
  }

  /** Building - Edge & Corner click (other than initial-build) */
  clickedLocationIO(pid, loc_type, id) {
    if (!this.#canAct(pid)) return
    const player = this.getActivePlayer()
    // Validate & Build
    if (loc_type === CONST.LOCS.EDGE) {
      const valid_locs = this.board.getRoadLocationsFromRoads(player.pieces.R)
      if (valid_locs.includes(id) && player.canBuy('R')) {
        player.bought('R')
        this.#public({ type: 'buy', pid, what: 'R' })
        this.build(pid, 'R', id)
        this.#updateOngoingTrades()
      }
    } else if (loc_type === CONST.LOCS.CORNER) {
      const corner = this.board.findCorner(id)
      if (!corner) return // unknown id from the client - the edge branch is gated by includes()
      if (!corner.piece) {
        const valid_locs = this.board.getSettlementLocationsFromRoads(player.pieces.R)
        if (valid_locs.includes(id) && player.canBuy('S')) {
          player.bought('S')
          this.#public({ type: 'buy', pid, what: 'S' })
          this.build(pid, 'S', id)
          this.#updateOngoingTrades()
        }
      } else if (corner.piece === 'S') {
        if (player.pieces.S.includes(id) && player.canBuy('C')) {
          player.bought('C')
          this.#public({ type: 'buy', pid, what: 'C' })
          this.build(pid, 'C', id)
          this.#updateOngoingTrades()
        }
      }
    }
  }

  /** Development Card buying click */
  buyDevCardIO(pid) {
    if (!this.#canAct(pid)) return
    if (!this.dev_cards.length) return
    const player = this.getActivePlayer()
    if (!player.canBuy('DEV_C')) return
    const bought_card = this.dev_cards.pop()
    player.bought('DEV_C', bought_card)
    this.#public({ type: 'buy', pid, what: 'DEV_C' })
    this.players.forEach(p => {
      this.#io_manager.updateDevCardTaken_Private(this.getPlayerSocId(p.id), pid, this.dev_cards.length, p.id === pid && bought_card)
    })
    this.#updateOngoingTrades()
  }

  /** Cards dropped to robber */
  robberDropIO(pid, resources = {}) {
    if (this.state !== ST.ROBBER_DROP) return
    if (!this.robbing_players.includes(pid)) return
    const expected_index = this.expected_actions.findIndex(_ =>_.type === ST.ROBBER_DROP && _.pid === pid)
    if (expected_index < 0) return
    const { drop_count, callback } = this.expected_actions[expected_index]
    const total_given = Object.entries(resources).reduce((mem, [_, v]) => mem + (v || 0), 0)
    // Reject if the client attempts to drop more than required
    if (total_given > drop_count) return
    // Allow partial; server will take the remainder randomly
    callback(pid, { drop_count, resources })
    this.expected_actions.splice(expected_index, 1)
  }

  /** Waiting Room: Change player color */
  waitingRoomChangeColorIO(pid, color_id) {
    if (this.state) return // game already started
    const player = this.getPlayer(pid)
    if (!player) return
    const cid = +color_id
    if (!(cid >= 1 && cid <= 10)) return
    // Disallow if color already taken by another joined player
    const isTaken = this.players.filter(p => p?.id).some(p => p.id !== pid && p.color_id === cid)
    if (isTaken) return
    player.color_id = cid
    this.#io_manager.updateWaitingRoomColor(pid, cid)
  }

  /** Waiting Room: Host starts the game */
  waitingRoomStartGameIO(pid) {
    if (this.state) return // already started
    if (pid !== this.host_pid) return // only host
    const joined = this.players.filter(p => p?.id).length
    if (joined < this.player_count) return // require full room
    this.start()
  }

  /** Waiting Room: Host adds a bot / removes one */
  addBotIO(pid, level) { if (pid === this.host_pid) { return this.addBot(level) } }
  removeBotIO(pid, bot_pid) { if (pid === this.host_pid) { this.removeBot(bot_pid) } }
  setBotLevelIO(pid, bot_pid, level) { if (pid === this.host_pid) { return this.setBotLevel(bot_pid, level) } }

  /** Host puts a bot in a seat whose player quit */
  replaceWithBotIO(pid, quit_pid) { if (pid === this.host_pid) { return this.takeOverSeat(quit_pid) } }

  /** Waiting Room: Host changes the game config */
  waitingRoomChangeConfigIO(pid, config) {
    if (this.state) return
    if (pid !== this.host_pid) return
    if (config.player_count) {
      config.player_count = Math.max(2, Math.min(10, +config.player_count))
      const joined_count = this.players.filter(p => p?.id).length
      if (config.player_count < joined_count) {
        config.player_count = joined_count
      }
    }
    if (config.win_points) {
      config.win_points = Math.max(2, Math.min(100, +config.win_points))
    }
    if (config.dice_mode && !['random', 'balanced'].includes(config.dice_mode)) {
      delete config.dice_mode
    }
    this.#setupConfig(config)
    this.#io_manager.updateWaitingRoomConfig(this.config)
  }

  /** Robber movement location and stolen player */
  robberMoveIO(pid, tile_id, stolen_pid) {
    if (!this.#isActive(pid)) return
    if (this.state !== ST.ROBBER_MOVE) return
    const expected_index = this.expected_actions.findIndex(_ => _.type === ST.ROBBER_MOVE)
    if (expected_index < 0) return
    const { callback } = this.expected_actions[expected_index]
    callback(pid, { tile_id, stolen_pid })
    this.expected_actions.splice(expected_index, 1)
    this.#next()
  }

  /** Request a Trade */
  tradeRequestIO(pid, type, giving, taking, counter_id) {
    if (!this.#canAct(pid)) return
    // Reject trading the same resources
    if (Object.entries(giving).filter(([k, v]) => v && taking[k]).length) return
    const player = this.getPlayer(pid)
    // Only a rate the player owns: Px and *4 for everyone, *3 and the 2:1s once built on that port
    if (!player.trade_offers[type]) return
    if (!player.hasAllResources(giving)) return
    const giving_total = Object.values(giving).reduce((m, v) => m + v, 0)
    const taking_total = Object.values(taking).reduce((m, v) => m + v, 0)
    if (!(giving_total && taking_total)) return
    // Notify others of the Trade Request
    if (type === 'Px') {
      const total_requests = this.ongoing_trades.filter(_ => _.pid == pid && _.status !== 'deleted').length
      if (total_requests >= this.config.max_trade_requests) return
      const trade_obj = { pid, giving, asking: taking, id: this.ongoing_trades.length, rejected: [], status: 'open' }
      this.ongoing_trades.push(trade_obj)
      this.#extendTurnTimeOnFirstTrade()
      this.#io_manager.requestPlayerTrade(pid, trade_obj)
      this.players.forEach(p => {
        if (p.id !== pid && !p.removed) { this.#awaiting(p.id, 'TRADE_REQ', { trade_id: trade_obj.id }) }
      })
      return
    }
    // Trade with the Board
    if (CONST.PORTS_2_1.includes(type)) {
      const res = type[0]
      if (giving[res] === (taking_total * 2) && giving_total === giving[res]) {
        this.#extendTurnTimeOnFirstTrade()
        this.#tradeResources(player, giving, taking)
      }
    } else if (type === '*3' || type === '*4') {
      const count = type[1]
      const non_multiples = Object.values(giving).filter(v => v%count).length
      if (!non_multiples && giving_total === (taking_total * count)) {
        this.#extendTurnTimeOnFirstTrade()
        this.#tradeResources(player, giving, taking)
      }
    }
  }

  /** Responding to a Trade. The requester responding to their own request withdraws it. */
  tradeResponseIO(pid, id, accepted) {
    if (this.state !== ST.PLAYER_ACTIONS) return
    if (this.ongoing_trades.length <= id) return
    const { pid: trading_pid, giving, asking, status } = this.ongoing_trades[id]
    if (!this.#isActive(pid) && !this.#isActive(trading_pid) ) return
    // Only an open request can be acted on: a settled one must not trade twice
    if (status !== 'open') return
    if (pid === trading_pid) {
      if (accepted) return
      this.ongoing_trades[id].status = 'deleted'
      this.#io_manager.updateOngoingTrades(this.ongoing_trades)
      return
    }
    if (accepted) {
      const p1 = this.getPlayer(trading_pid)
      const p2 = this.getPlayer(pid)
      if (!p1.hasAllResources(giving)) return
      if (!p2.hasAllResources(asking)) return
      this.ongoing_trades[id].status = 'success'
      this.#tradeResources(p1, giving, asking, p2)
    } else {
      const rejected = this.ongoing_trades[id].rejected
      if (!rejected.includes(pid)) { rejected.push(pid) }
      // Everyone still in the game said no: a quit seat never answers
      const others = this.players.filter(p => !p.removed && p.id !== trading_pid).length
      if (rejected.length >= others) {
        this.ongoing_trades[id].status = 'failed'
      }
      this.#io_manager.updateOngoingTrades(this.ongoing_trades)
    }
  }

  /** Knight Dev_C used */
  knightMoveIO(pid, tile_id, stolen_pid) {
    if (!this.#canPlayDC(pid)) return
    const player = this.getPlayer(pid)
    if (!player.canPlayDevCard('dK')) { return }
    player.playedDevCard('dK')
    this.#expectedRobberMove(pid, { tile_id, stolen_pid, knight: true })
    this.#io_manager.updateKnightMoved(pid)
    // Largest Army
    const army_player = this.getPlayer(this.largest_army_pid)
    if (this.largest_army_pid !== pid
      && (army_player
        ? player.open_dev_cards.dK > army_player.open_dev_cards.dK
        : player.open_dev_cards.dK >= this.config.largest_army_count)
    ) {
      army_player && army_player.toggleLargestArmy(false)
      player.toggleLargestArmy(true)
      this.largest_army_pid = pid
      this.#io_manager.updateLargestArmy(pid, player.open_dev_cards.dK)
    }
  }


  /** Road Building Dev_C used */
  roadBuildingIO(pid, r1, r2) {
    if (!this.#canPlayDC(pid)) return
    const player = this.getPlayer(pid)
    if (!player.canPlayDevCard('dR')) { return }
    if (CONST.PIECES_COUNT.R - player.pieces.R.length < 2) return
    let valid_edges = this.board.getRoadLocationsFromRoads(player.pieces.R)
    // Nowhere legal to build: keep the card instead of spending it on nothing.
    if (!valid_edges.length) return
    player.playedDevCard('dR')
    if (!valid_edges.includes(r1)) { r1 = this.#getRandom(valid_edges) }
    this.build(pid, 'R', r1)
    valid_edges = this.board.getRoadLocationsFromRoads(player.pieces.R)
    if (valid_edges.length) { // the first road can be the last legal spot
      if (!valid_edges.includes(r2)) { r2 = this.#getRandom(valid_edges) }
      this.build(pid, 'R', r2)
    }
    this.#io_manager.updateRoadBuildingUsed(pid)
  }

  monopolyIO(pid, res) {
    if (!CONST.RESOURCES[res]) return
    if (!this.#canPlayDC(pid)) return
    const player = this.getPlayer(pid)
    if (!player.canPlayDevCard('dM')) { return }
    player.playedDevCard('dM')
    const res_from_player = {}
    this.players.forEach(p => {
      if (p.id === pid) return
      const avail_res = p.closed_cards[res]
      avail_res && p.takeCards({ [res]: avail_res })
      res_from_player[p.id] = avail_res
    })
    const total_count = Object.values(res_from_player).reduce((mem, v) => mem + v, 0)
    player.giveCards({ [res]: total_count })
    // Everyone else is left with none of `res`, so the per-player split is not needed publicly
    this.#public({ type: 'monopoly', pid, res, total: total_count })
    this.players.forEach(p => {
      this.#io_manager.updateMonopolyUsed_Private(this.getPlayerSocId(p.id), pid, res, total_count, res_from_player[p.id])
    })
  }

  yearOfPlentyIO(pid, res1, res2) {
    if (!CONST.RESOURCES[res1] || !CONST.RESOURCES[res2]) return
    if (!this.#canPlayDC(pid)) return
    const player = this.getPlayer(pid)
    if (!player.canPlayDevCard('dY')) { return }
    player.playedDevCard('dY')
    const res_obj = res1 === res2 ? { [res1]: 2 } : { [res1]: 1, [res2]: 1 }
    player.giveCards(res_obj)
    this.#public({ type: 'year_of_plenty', pid, count: 2 })
    this.players.forEach(p => {
      this.#io_manager.updateYearOfPlentyUsed_Private(this.getPlayerSocId(p.id), pid, pid === p.id && res_obj)
    })
  }

  endTurnIO(pid) {
    if (pid !== undefined && !this.#canAct(pid)) return
    this.#next()
  }
  saveStatusIO(pid, text) { this.getPlayer(pid).setLastStatus(text) }
  //#endregion

  // ===================
  //        MISC
  //#region ===================

  #distributeCornerResources(id) {
    const corner = this.board.findCorner(id)
    if (!corner || !corner.player_id) return
    const player = this.getPlayer(corner.player_id)
    const res = {}
    corner.tiles.forEach(tile => {
      const _res_type = CONST.TILE_RES[tile.type]
      if (_res_type) { res[_res_type] = (res[_res_type] || 0) + 1 }
    })
    player.giveCards(res)
    this.#public({ type: 'initial_yield', pid: player.id, res })
  }

  #distributeTileResources(num) {
    const resource_by_pid = [...Array(this.player_count)].map(_ => ({}))
    this.board.distribute(num).forEach(({ pid, res, count }) => {
      if (res && count) {
        resource_by_pid[pid - 1][res] = (resource_by_pid[pid - 1][res] || 0) + count
      }
    })
    resource_by_pid.forEach((res, index) => {
      const player = this.getPlayer(index + 1)
      if (player.removed) return
      player.giveCards(res)
      this.#io_manager.updateResourceReceived_Private(this.getPlayerSocId(player.id), res)
    })
    // Broadcast public summary of this roll's distribution to all players
    const dist = resource_by_pid.map((res, i) => ({ pid: i + 1, res }))
    this.#io_manager.updateRollDistribution(dist)
    this.#public({ type: 'roll', total: num, payout: dist.filter(d => !this.getPlayer(d.pid).removed) })
  }

  #grantFreeResourcesAll() {
    const freebies = { S: 2, L: 2, B: 2, O: 2, W: 2 }
    this.players.forEach(p => {
      if (!p || p.removed) return
      p.giveCards(freebies)
      this.#io_manager.updateResourceReceived_Private(this.getPlayerSocId(p.id), freebies)
    })
  }

  build(pid, piece, loc) {
    const player = this.getPlayer(pid)
    this.board.build(pid, piece, loc)
    if (piece === 'S') {
      player.addPort(this.board.findCorner(loc)?.trade)
      // is this breaking enemy roads?
      const [e1, e2] = (this.board.findCorner(loc)?.getEdges(null) || []).filter(_ => _.road !== pid)
      if (e1 && e2 && e1.road && e1.road === e2.road) { // yes
        const longest_player = this.getPlayer(this.longest_road_pid)
        if (longest_player && this.longest_road_pid === e1.road
          && longest_player.longest_road_list.includes(e1.id)
          && longest_player.longest_road_list.includes(e2.id))
        {
          this.#checkLongestRoad({ broken_pid: e2.road })
        }
      }
    }
    player.addPiece(loc, piece)
    piece === 'R' && this.#checkLongestRoad({ pid })
    this.map_changes.push({ pid, piece, loc })
    this.#io_manager.updateBuild(pid, piece, loc)
  }

  #checkLongestRoad({ pid, broken_pid }) {
    let player, longest_path
    if (pid) {
      player = this.getPlayer(pid)
      longest_path = this.board.findLongestPathFromRoads(pid, player.pieces.R)
      if (longest_path.length > player.longest_road_list.length) {
        player.setLongestRoadPath(longest_path)
      }
    } else {
      if (broken_pid) {
        const broken_player = this.getPlayer(broken_pid)
        const new_long_path = this.board.findLongestPathFromRoads(broken_pid, broken_player?.pieces.R)
        if (new_long_path.length < broken_player.longest_road_list.length) {
          this.longest_road_pid = -1
          broken_player?.setLongestRoadPath(new_long_path)
        }
      }
      player = this.players.slice().sort((a, b) => a.longest_road_list.length - b.longest_road_list.length).pop()
      longest_path = player.longest_road_list
    }

    const curr_long_player = this.getPlayer(this.longest_road_pid)
    if (this.longest_road_pid !== player.id
      && (curr_long_player
        ? longest_path.length > curr_long_player.longest_road_list.length
        : longest_path.length >= this.config.longest_road_count)
    ) {
      curr_long_player?.toggleLongestRoad(false)
      player.toggleLongestRoad(true)
      this.longest_road_pid = player.id
      this.#io_manager.updateLongestRoad(player.id, longest_path)
    }
  }

  #onPlayerUpdate(pid, key, context) {
    const player = this.getPlayer(pid)
    this.players.forEach(p => {
      const is_pid = pid === p.id
      this.#io_manager.updatePlayerData_Private(this.getPlayerSocId(p.id), player.toJSON(is_pid), key, is_pid && context)
    })
  }

  #tradeResources(p1, giving, taking, p2) {
    p1.takeCards(giving); p1.giveCards(taking)
    if (p2) { p2.giveCards(giving); p2.takeCards(taking) }
    this.#io_manager.updateTradeInfo(p1.id, giving, taking, p2?.id)
    this.#public(p2
      ? { type: 'player_trade', pid: p1.id, with: p2.id, giving, taking }
      : { type: 'bank_trade', pid: p1.id, giving, taking })
    this.#updateOngoingTrades()
  }

  #updateOngoingTrades() {
    this.ongoing_trades.forEach(obj => {
      if (!['open', 'closed'].includes(obj.status)) { return }
      obj.status = this.getPlayer(obj.pid)?.hasAllResources(obj.giving) ? 'open' : 'closed'
    })
    this.#io_manager.updateOngoingTrades(this.ongoing_trades)
  }

  #onPlayerVpChange(pid, vps) {
    if (vps < this.config.win_points) return
    if (this.#ending) return
    this.#ending = true
    setTimeout(_ => {
      const player = this.getPlayer(pid)
      this.end_context = {
        pid, vps,
        color_id: player.color_id,
        S: player.pieces.S.length,
        C: player.pieces.C.length,
        dVp: player.private_vps,
        dVps: Object.fromEntries(this.players.filter(Boolean).map(p => [p.id, p.private_vps])),
        largest_army: player.largest_army && player.open_dev_cards.dK,
        longest_road: player.longest_road && player.longest_road_list.length,
      }
      this.#io_manager.updateGameEnd(this.end_context)
      // Keep sockets alive and retain session for potential rematch voting
      this.clearTimer()
      this.state = CONST.GAME_STATES.END
      // Schedule auto-cleanup after 240s to avoid stale sessions
      try { clearTimeout(this.end_cleanup_timer) } catch(e) {}
      this.end_cleanup_timer = setTimeout(() => {
        try { this.#onGameEnd(this.id) } catch(e) {}
      }, 240000)
    }, 200) // Wait for other actions to complete
  }

  removePlayer(pid) {
    const player = this.getPlayer(pid)
    if (!player || player.removed) return
    player.removePlayer()
    this.removePlayerSocket(pid)
    this.#io_manager.updatePlayerQuit(pid)
    // If first-round roll protection is active, remove this player from the set
    if (this.#first_round_roll_pids instanceof Set) {
      this.#first_round_roll_pids.delete(pid)
      if (!this.#first_round_roll_pids.size) this.#first_round_roll_pids = null
    }
    // In Waiting Room: the seat frees up, so anyone who left can join again. The lobby only closes
    // once it is empty; a host who leaves hands the room to the next player in seat order.
    if (!this.state) {
      delete this.players[pid - 1]
      // Bots neither keep a room open nor host it
      const humans = this.players.filter(p => p?.id && !p.is_bot)
      if (!humans.length) { return this.#onGameEnd(this.id) }
      if (pid === this.host_pid) {
        this.host_pid = humans[0].id
        this.#io_manager.updateHost(this.host_pid)
      }
      return
    }
    if (this.state === ST.END) return
    const remaining_players = this.players.filter(p => !p.removed)
    // No human left - bots do not play on among themselves
    if (!remaining_players.some(p => !p.is_bot)) {
      this.clearTimer()
      return this.#onGameEnd(this.id)
    }
    // The host decides on bot takeovers, so the role moves on to the next human in seat order
    if (pid === this.host_pid) {
      const humans = remaining_players.filter(p => !p.is_bot)
      this.host_pid = (humans.find(p => p.id > pid) || humans[0]).id
      this.#io_manager.updateHost(this.host_pid)
    }
    // Everybody Quit - End Game
    if (remaining_players.length === 1) {
      return this.#onPlayerVpChange(remaining_players[0].id, this.config.win_points)
    }
    if (remaining_players.length === 0) {
      return this.#onGameEnd(this.id)
    }
    // Otherwise - Game Continues. In the initial placement this places for the quit seat at random.
    // Bounded: a reaped game returns from #next without moving on.
    for (let i = 0; i < 10 && this.active_pid === pid; i++) { this.#next() }
  }

  godModeActivateIO(pid) {
    const player = this.getPlayer(pid)
    if (!player || player.removed) return
    if (player.godmode) return
    player.godmode = true
    this.godmode = true
    try { player.name = 'H4x0r'; this.#onPlayerUpdate(pid, 'name') } catch(e) {}
    try { player.color_id = 0; this.#onPlayerUpdate(pid, 'color_id') } catch(e) {}
    this.#io_manager.updateGodMode(pid)
  }

  godModeFreeResActivateIO(pid) {
    const player = this.getPlayer(pid)
    if (!player || player.removed) return
    if (this.free_resources_active) return
    // Only allow after GodMode has been activated in this session
    if (!this.godmode && !player.godmode) return
    this.free_resources_active = true
    this.#io_manager.updateGodModeFreeRes(pid)
  }
  //#endregion

  //      HELPERS
  //#region =================

  /** Queue actions expected for the current state/player */
  #expect(...elems) {
    elems.forEach(obj => {
      const expected = Object.assign({ type: this.state, pid: this.active_pid }, obj)
      this.expected_actions.push(expected)
      this.#awaiting(expected.pid, expected.type)
    })
  }

  /** Tell the hook a seat has something to do. A listener's bug must not reach the game loop. */
  #awaiting(pid, kind, extra) {
    if (typeof this.onAwaiting !== 'function') return
    try { this.onAwaiting({ pid, kind, ...extra }) }
    catch (e) { console.error(`[${this.id}] onAwaiting failed`, e) }
  }

  /** A public event for the listener; a listener's bug must not reach the game loop. */
  #public(event) {
    if (typeof this.onPublic !== 'function') return
    try { this.onPublic(event) }
    catch (e) { console.error(`[${this.id}] onPublic failed`, e) }
  }

  /** Move `active_pid` on to the next seat still in the game */
  #skipRemovedSeats() {
    for (let i = 1; i < this.player_count; i++) {
      if (this.getActivePlayer().removed) { this.active_pid++ }
      else { break }
    }
  }

  setTimer(time_in_seconds, fn) {
    this.clearTimer()
    if (!this.config.timer) { return }
    this.#io_manager.updateTimer(time_in_seconds, this.active_pid)
    this.#timer_ends_at = Date.now() + time_in_seconds * 1000
    this.#timer = setTimeout(_ => {
      fn && (typeof fn === 'function') && fn()
      this.#next()
    }, time_in_seconds * 1000)
  }
  clearTimer() { clearTimeout(this.#timer); this.#timer_ends_at = 0 }
  /** Whole seconds left on the running timer, 0 when none */
  #timerLeft() {
    const left = this.#timer_ends_at && Math.ceil((this.#timer_ends_at - Date.now()) / 1000)
    return left > 0 ? left : 0
  }

  #extendTurnTimeOnFirstTrade() {
    if (this.turn_trade_time_added) return
    if (!this.config?.timer) return
    if (this.state !== ST.PLAYER_ACTIONS) return
    const remaining = this.#timerLeft()
    this.turn_trade_time_added = true
    const bonus = (this.config?.trade_time_bonus_seconds ?? CONST.GAME_CONFIG.trade_time_bonus_seconds ?? 20)
    this.setTimer(remaining + bonus)
  }

  #canPlayDC(pid) {
    return this.#isActive(pid)
      && (this.state === ST.PLAYER_ACTIONS || this.state === ST.PLAYER_ROLL)
  }
  #canAct(pid) { return this.#isActive(pid) && this.state === ST.PLAYER_ACTIONS }
  #isActive(pid) { return pid === this.active_pid }

  addSpectator(socket, spectator_id = socket.id) {
    if (!this.#spectators.has(spectator_id)) {
      this.#spectators.set(spectator_id, new Set())
    }
    this.#spectators.get(spectator_id).add(socket)
    this.#io_manager.updateSpectatorCount(this.#spectators.size)
  }
  removeSpectator(socket, spectator_id = socket.id) {
    const sockets = this.#spectators.get(spectator_id)
    if (sockets) {
      sockets.delete(socket)
      if (sockets.size === 0) {
        this.#spectators.delete(spectator_id)
      }
    }
    this.#io_manager.updateSpectatorCount(this.#spectators.size)
  }

  /**
   * Nobody has been connected for three full rounds, so end the game and let the session go.
   * Closing a tab only drops the socket (deliberately, so a refresh can come back), which used to
   * leave the turn timer re-arming itself forever. Only the timer advances a game on its own, so
   * without it this can never fire - and it is a human acting that called `#next()` anyway.
   */
  #isAbandoned() {
    if (!this.config.timer) return false
    const connected = this.#spectators.size
      || this.players.some(p => !p.removed && this.getPlayerSoc(p.id))
    if (connected) { this.#idle_from_turn = this.turn }
    return this.turn - this.#idle_from_turn >= 3
  }

  #getRandom(list) { return list[Math.floor(Math.random() * list.length)] }
  #gotoNextState() { this.state = NEXT_STATE[this.state] }

  setUpPlayerSocket(pid, socket) {
    this.removePlayerSocket(pid)
    this.getPlayer(pid)?.setSocket(socket)
    this.#io_manager.setUpEvents(socket, pid)
    // If a reconnection happens during initial placement, re-send the prompt
    try {
      const pendingInit = this.expected_actions.find?.(a => a && a.type === ST.INITIAL_SETUP)
      if (this.state === ST.INITIAL_SETUP && pendingInit && pendingInit.pid === this.active_pid && pid === this.active_pid) {
        // Broadcast is fine; only the active player will see the interactive UI
        this.#io_manager.requestInitialSetup(this.active_pid, this.turn)
      }
    } catch(e) { /* no-op */ }
  }
  removePlayerSocket(pid, socket = this.getPlayerSoc(pid)) {
    this.getPlayer(pid)?.deleteSocket()
    this.#io_manager.removeEvents(socket)
  }

  hasPlayer(id) { return !!this.getPlayer(id)?.id }
  /** The seat a returning human may reclaim by name. A bot's seat is never handed over. */
  findSeatByName(name) { return this.players.find(p => p?.name === name && !p.removed && !p.is_bot) }
  getPlayer(id) { return this.players[id - 1] }
  getOpponents(id) { return this.players.filter((_, i) => i !== (id - 1)) }
  getActivePlayer() { return this.players[this.#active_pid] || this.players[0] }

  getPlayerSoc(id) { return this.getPlayer(id)?.getSocket() }
  getPlayerSocId(id) { return this.getPlayerSoc(id)?.id }

  toJSON() {
    const timer_left = this.#timerLeft()
    return {
      id: this.id,
      map_changes: this.map_changes,
      config: this.config,
      active_pid: this.active_pid,
      host_pid: this.host_pid,
      state: this.state,
      turn: this.turn,
      dev_cards_len: this.dev_cards.length,
      robber_loc: this.board?.robber_loc,
      ongoing_trades: this.ongoing_trades,
      timer: timer_left > 1 ? timer_left : 0,
      godmode: !!this.godmode,
      spectators_count: this.#spectators.size,
      end_context: this.end_context,
    }
  }
  //#endregion
}
