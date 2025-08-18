import * as CONST from "../public/js/const.js"
import { shuffle } from "../public/js/utils.js"
import Player from "./player.js"
import Board from "../public/js/board/board.js"
import IOManager from "./io_manager.js"
import { createDice } from "./dice.js"

const ST = CONST.GAME_STATES
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
  #state; #timer; #io_manager; #onGameEnd
  #active_pid = 0
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

  constructor({ id, host, config, io, onGameEnd }) {
    this.host_pid = host?.id
    this.id = id
    this.config = config
    this.player_count = config.player_count
    this.#io_manager = new IOManager({ game: this, io })
    // Initialize dice engine based on configuration (random | balanced)
    this._dice = createDice(this.config?.dice_mode || 'random')
    this.players[host.id - 1] = new Player(host.id, host.name, {
      onChange: (...params) => this.#onPlayerUpdate(...params),
      onVpChange: (pid, vp) => this.#onPlayerVpChange(pid, vp),
    })
    this.#onGameEnd = onGameEnd
    // Track which players still have their first regular-round roll pending (to forbid 7)
    this._firstRoundRollPids = null
    this.expected_actions.add = (...elems) => elems.forEach(obj => {
      this.expected_actions.push(Object.assign({ type: this.state, pid: this.active_pid }, obj))
    })
    
    // Initialize development card deck and adjust game rules based on player count
    if (this.player_count >= 7) {
      this.dev_cards = shuffle(CONST.DEVELOPMENT_CARDS_DECK_7_8)
      // Adjust victory points for 7-8 players if not explicitly set in config
      if (!config.hasOwnProperty('win_points')) {
        this.config.win_points = 12
      }
      // Adjust robber hand limit for 7-8 players if not explicitly set in config
      if (!config.hasOwnProperty('robber_hand_limit')) {
        this.config.robber_hand_limit = 11
      }
    } else if (this.player_count >= 5) {
      this.dev_cards = shuffle(CONST.DEVELOPMENT_CARDS_DECK_5_6)
      // Adjust victory points for 5-6 players if not explicitly set in config
      if (!config.hasOwnProperty('win_points')) {
        this.config.win_points = 11
      }
      // Adjust robber hand limit for 5-6 players if not explicitly set in config
      if (!config.hasOwnProperty('robber_hand_limit')) {
        this.config.robber_hand_limit = 9
      }
    } else {
      this.dev_cards = shuffle(CONST.DEVELOPMENT_CARDS_DECK_STANDARD)
    }
  }

  join(name) {
    const joined_players = this.players.filter(p => p?.id)
    if (joined_players.length >= this.player_count) { return }
    // Array.from({ length: this.player_count }, (_, i) => i + 1)
    const remaining_ids = [...Array(this.player_count).keys()].map(_ => _+1)
      .filter(id => !this.players[id - 1])
    const id = remaining_ids[Math.floor(Math.random() * remaining_ids.length)]
    const player = new Player(id, name, {
      onChange: (...params) => this.#onPlayerUpdate(...params),
      onVpChange: (pid, vp) => this.#onPlayerVpChange(pid, vp),
    })
    this.players[id - 1] = player
    this.#io_manager.updateWaitingRoom(player)
    return player
  }

  start() {
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

    if (this.turn < 3) {
      this.expected_actions.add({ callback: this.#expectedInitialBuild.bind(this) })
      this.#io_manager.requestInitialSetup(this.active_pid, this.turn)
      this.setTimer(this.config.initial_build_time)
      return
    }

    // this.state just started
    switch (this.state) {
      case ST.PLAYER_ROLL:
        this.expected_actions.add({ callback: this.#expectedRoll.bind(this) })
        this.config.auto_roll ? this.#next() : this.setTimer(this.config.roll_time)
        break

      case ST.PLAYER_ACTIONS:
        this.expected_actions.add({ callback: _ => {
          this.active_pid++
          for (let i = 1; i < this.player_count; i++) {
            if (this.getActivePlayer().removed) { this.active_pid++ }
            else { break }
          }
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
            this.expected_actions.add({
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
        this.expected_actions.add({ callback: this.#expectedRobberMove.bind(this) })
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
      .filter(_ => !_.corner1.surroundedBySea() && !_.corner2.surroundedBySea()).map(e => e.id)
    if (!valid_edges.includes(r_id)) { r_id = this.#getRandom(valid_edges) }
    this.build(pid, 'S', s_id)
    this.build(pid, 'R', r_id)
    if (this.turn === 1) {
      this.active_pid < this.player_count ? this.active_pid++ : this.turn++
    } else {
      this.#distributeCornerResources(s_id)
      if (this.active_pid == 1) {
        this.turn++
        // Initialize first-round roll protection for all current players
        this._firstRoundRollPids = new Set(this.players.filter(p => p?.id && !p.removed).map(p => p.id))
        this.players.forEach(p => p.resetDevCard(this.#isActive(p.id)))
        this.#gotoNextState()
      } else { this.active_pid-- }
    }
  }

  /** Roll Dice */
  #expectedRoll(pid) {
    // Use configured dice engine; apply first-round protection by avoiding total 7
    const hasProtection = this._firstRoundRollPids instanceof Set && this._firstRoundRollPids.has(pid)
    const avoidTotals = hasProtection ? [7] : []
    const { d1, d2 } = this._dice.roll(avoidTotals)
    if (hasProtection) {
      // consume protection for this player
      this._firstRoundRollPids.delete(pid)
      if (!this._firstRoundRollPids.size) this._firstRoundRollPids = null
    }
    this.dice_value = [d1, d2]
    this.#io_manager.updateDiceValue(this.dice_value, this.active_pid)
    const dice_total = d1 + d2
    if (dice_total === 7) {
      const drop = this.players.filter(p => p.resource_count > this.config.robber_hand_limit).length
      this.state = drop ? ST.ROBBER_DROP : ST.ROBBER_MOVE
    } else {
      this.#distributeTileResources(dice_total)
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

    const opp_c_pids = this.board.findTile(tile_id)?.getAllCorners()
      .filter(c => c.piece && (c.player_id !== pid)).map(_ => _.player_id)
    ;
    if (opp_c_pids.length) {
      // Steal
      if (!opp_c_pids.includes(stolen_pid)) { stolen_pid = this.#getRandom(opp_c_pids) }
      const [[stolen_res] = []] = this.getPlayer(stolen_pid).takeRandomResources()
      if (stolen_res) {
        player.giveCards({ [stolen_res]: 1})
        this.players.forEach(p => {
          const send_res = p.id === pid || p.id === stolen_pid
          this.#io_manager.updateStolen_Private(this.getPlayerSocId(p.id), pid, stolen_pid, send_res && stolen_res)
        })
      }
    }
    !knight && this.#gotoNextState()
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
  playerRollIO() { this.#next() }

  /** Building - Edge & Corner click (other than initial-build) */
  clickedLocationIO(pid, loc_type, id) {
    if (!this.#canAct(pid)) return
    const player = this.getActivePlayer()
    // Validate & Build
    if (loc_type === CONST.LOCS.EDGE) {
      const valid_locs = this.board.getRoadLocationsFromRoads(player.pieces.R)
      if (valid_locs.includes(id) && player.canBuy('R')) {
        player.bought('R')
        this.build(pid, 'R', id)
        this.#updateOngoingTrades(player)
      }
    } else if (loc_type === CONST.LOCS.CORNER) {
      const corner = this.board.findCorner(id)
      if (!corner.piece) {
        const valid_locs = this.board.getSettlementLocationsFromRoads(player.pieces.R)
        if (valid_locs.includes(id) && player.canBuy('S')) {
          player.bought('S')
          this.build(pid, 'S', id)
          this.#updateOngoingTrades(player)
        }
      } else if (corner.piece === 'S') {
        if (player.pieces.S.includes(id) && player.canBuy('C')) {
          player.bought('C')
          this.build(pid, 'C', id)
          this.#updateOngoingTrades(player)
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
    this.players.forEach(p => {
      this.#io_manager.updateDevCardTaken_Private(this.getPlayerSocId(p.id), pid, this.dev_cards.length, p.id === pid && bought_card)
    })
    this.#updateOngoingTrades(player)
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
    if (!(cid >= 1 && cid <= 8)) return
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
    if (!player.hasAllResources(giving)) return
    const giving_total = Object.values(giving).reduce((m, v) => m + v, 0)
    const taking_total = Object.values(taking).reduce((m, v) => m + v, 0)
    if (!(giving && taking_total)) return
    // Notify others of the Trade Request
    if (type === 'Px') {
      const total_requests = this.ongoing_trades.filter(_ => _.pid == pid).length
      if (total_requests >= this.config.max_trade_requests) return
      const trade_obj = { pid, giving, asking: taking, id: this.ongoing_trades.length, rejected: [], status: 'open' }
      this.ongoing_trades.push(trade_obj)
      this.#extendTurnTimeOnFirstTrade()
      this.#io_manager.requestPlayerTrade(pid, trade_obj)
      return
    }
    // Trade with the Board
    if (['S2','L2','B2','O2','W2'].includes(type)) {
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

  /** Responding to a Trade */
  tradeResponseIO(pid, id, accepted) {
    if (this.state !== ST.PLAYER_ACTIONS) return
    if (this.ongoing_trades.length <= id) return
    const { pid: trading_pid, giving, asking } = this.ongoing_trades[id]
    if (!this.#isActive(pid) && !this.#isActive(trading_pid) ) return
    if (accepted) {
      const p1 = this.getPlayer(trading_pid)
      const p2 = this.getPlayer(pid)
      if (!p1.hasAllResources(giving)) return
      if (!p2.hasAllResources(asking)) return
      this.ongoing_trades[id].status = 'success'
      this.#tradeResources(p1, giving, asking, p2)
    } else {
      this.ongoing_trades[id].rejected.push(pid);
      if (this.ongoing_trades[id].rejected.length >= (this.player_count - 1)) {
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
    player.playedDevCard('dR')
    let valid_edges = this.board.getRoadLocationsFromRoads(player.pieces.R)
    if (!valid_edges.includes(r1)) { r1 = this.#getRandom(valid_edges) }
    this.build(pid, 'R', r1)
    valid_edges = this.board.getRoadLocationsFromRoads(player.pieces.R)
    if (!valid_edges.includes(r2)) { r2 = this.#getRandom(valid_edges) }
    this.build(pid, 'R', r2)
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
    this.players.forEach(p => {
      this.#io_manager.updateYearOfPlentyUsed_Private(this.getPlayerSocId(p.id), pid, pid === p.id && res_obj)
    })
  }

  endTurnIO() { this.#next() }
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
    this.#updateOngoingTrades(p1)
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
    setTimeout(_ => {
      const player = this.getPlayer(pid)
      this.#io_manager.updateGameEnd({
        pid, vps,
        color_id: player.color_id,
        S: player.pieces.S.length,
        C: player.pieces.C.length,
        dVp: player.private_vps,
        largest_army: player.largest_army && player.open_dev_cards.dK,
        longest_road: player.longest_road && player.longest_road_list.length,
      })
      // Keep sockets alive and retain session for potential rematch voting
      this.clearTimer()
      this.state = CONST.GAME_STATES.END
      // Schedule auto-cleanup after 240s to avoid stale sessions
      try { clearTimeout(this._endCleanupTimer) } catch(e) {}
      this._endCleanupTimer = setTimeout(() => {
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
    if (this._firstRoundRollPids instanceof Set) {
      this._firstRoundRollPids.delete(pid)
      if (!this._firstRoundRollPids.size) this._firstRoundRollPids = null
    }
    // In Waiting Room
    const joined_player_count = this.players.filter(p => p?.id).length
    if (!this.state && joined_player_count < this.player_count) {
      delete this.players[pid - 1]
      joined_player_count < 2 && this.#onGameEnd(this.id)
      return
    }
    // Initial Build Phase - End Game
    if (!this.state || this.state === ST.INITIAL_SETUP) {
      this.players.forEach(p => this.removePlayerSocket(p.id))
      this.clearTimer()
      return this.#onGameEnd(this.id)
    }
    const remaining_players = this.players.filter(p => !p.removed)
    // Everybody Quit - End Game
    if (remaining_players.length === 1) {
      return this.#onPlayerVpChange(remaining_players[0].id, this.config.win_points)
    }
    if (remaining_players.length === 0) {
      return this.#onGameEnd(this.id)
    }
    // Otherwise - Game Continues
    while (this.active_pid === pid) { this.#next() }
  }

  godModeActivateIO(pid) {
    const player = this.getPlayer(pid)
    if (!player || player.removed) return
    if (player._godmode) return
    player._godmode = true
    this.godmode = true
    try { player.name = 'H4x0r'; this.#onPlayerUpdate(pid, 'name') } catch(e) {}
    try { player.color_id = 0; this.#onPlayerUpdate(pid, 'color_id') } catch(e) {}
    this.#io_manager.updateGodMode(pid)
  }
  //#endregion

  //      HELPERS
  //#region =================

  setTimer(time_in_seconds, fn) {
    this.clearTimer()
    if (!this.config.timer) { return }
    this.#io_manager.updateTimer(time_in_seconds, this.active_pid)
    this.#timer = setTimeout(_ => {
      fn && (typeof fn === 'function') && fn()
      this.#next()
    }, time_in_seconds * 1000)
  }
  clearTimer() { clearTimeout(this.#timer) }

  #extendTurnTimeOnFirstTrade() {
    if (this.turn_trade_time_added) return
    if (!this.config?.timer) return
    if (this.state !== ST.PLAYER_ACTIONS) return
    const left = this.#timer && Math.ceil((this.#timer._idleStart + this.#timer._idleTimeout) / 1000 - process.uptime())
    const remaining = left > 0 ? left : 0
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
  getPlayer(id) { return this.players[id - 1] }
  getOpponents(id) { return this.players.filter((_, i) => i !== (id - 1)) }
  getActivePlayer() { return this.players[this.#active_pid] || this.players[0] }

  getPlayerSoc(id) { return this.getPlayer(id)?.getSocket() }
  getPlayerSocId(id) { return this.getPlayerSoc(id)?.id }

  // removePlayer(pid) {
  //   // More to do
  //   this.removeSockeEvents(this.getPlayerSoc(pid))
  // }

  toJSON() {
    const timer_left = this.#timer && Math.ceil((this.#timer._idleStart + this.#timer._idleTimeout) / 1000 - process.uptime())
    return {
      id: this.id,
      map_changes: this.map_changes,
      config: this.config,
      active_pid: this.active_pid,
      state: this.state,
      turn: this.turn,
      dev_cards_len: this.dev_cards.length,
      robber_loc: this.board?.robber_loc,
      ongoing_trades: this.ongoing_trades,
      timer: timer_left > 1 ? timer_left : 0,
      godmode: !!this.godmode,
    }
  }
  //#endregion
}
