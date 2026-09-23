import * as CONST from '../../public/js/const.js'
import { buildView } from './view.js'
import { legalMoves, KINDS } from './moves.js'
import { evaluate as easy } from './easy.js'
import { evaluate as medium } from './medium.js'
import { evaluate as tryhard } from './tryhard.js'
import Tracker from './tracker.js'
import { production } from './features.js'

const ST = CONST.GAME_STATES
/** Hard stop for a turn that never ends: past this the bot takes the fallback. */
export const ACTION_CAP = 25
const ERRORS_BEFORE_EASY = 3
/** Phase timer (seconds, from the game config) a delay has to fit inside */
const PHASE_TIME = {
  [ST.INITIAL_SETUP]: 'initial_build_time', [ST.PLAYER_ROLL]: 'roll_time',
  [ST.PLAYER_ACTIONS]: 'player_turn_time', [ST.ROBBER_DROP]: 'robber_drop_time',
  [ST.ROBBER_MOVE]: 'robber_move_time', [ST.SPECIAL_BUILD]: 'special_build_time',
}

/**
 * Plays every bot seat of one game. Bots are ordinary callers of the `*IO` methods a human's
 * socket reaches, so every rule check applies to them. The controller never acts inside the
 * game's hook: it schedules a tick, and a tick whose turn / state / active seat / builder has moved on
 * does nothing. One action per tick, every tick wrapped, because a throw inside a timer would
 * take the whole process - every game on the server - down.
 */
export default class BotController {
  /** @type {import('../game.js').default} */ #game
  #evaluators; #delay_ms; #needs_humans; #onEvaluate
  /** action count per `turn|state|pid`, for the cap */
  #actions = new Map()
  #errors = new Map() // pid -> errors this game
  #trade_wait_ms
  /** Card counter fed by the game's public events; only tryhard reads it */
  tracker = new Tracker()
  /** pid -> { turn, trade_id, until, refused: Set<string> } while a bot's own request is open */
  #proposals = new Map()
  stats = { actions: 0, errors: 0, fallbacks: 0, demoted: 0, proposed: 0, accepted: 0, refused: 0, evaluate_ms: 0, evaluations: 0 }

  /**
   * @param {import('../game.js').default} game
   * @param {object} [opts]
   * @param {number} [opts.delay_ms] fixed delay; default is `config.bot_delay_ms` or 900-1800ms jittered
   * @param {boolean} [opts.needs_humans] stop once no human is left in the game (off in the simulator)
   * @param {Object<string, Function>} [opts.evaluators] level -> evaluate(view, moves)
   * @param {Function} [opts.onEvaluate] wraps every evaluate call: `(run, { game, pid, kind }) => intent`
   * @param {number} [opts.trade_wait_ms] how long a bot waits for answers to its own trade request;
   *   default `config.bot_trade_wait_ms` (8s) with a human in the game, 0 without
   */
  constructor(game, { delay_ms, needs_humans = true, evaluators = {}, onEvaluate, trade_wait_ms } = {}) {
    this.#game = game
    this.#delay_ms = delay_ms
    this.#needs_humans = needs_humans
    this.#evaluators = { easy, medium, tryhard, ...evaluators }
    this.#onEvaluate = onEvaluate
    this.#trade_wait_ms = trade_wait_ms
    game.onAwaiting = awaiting => this.#onAwaiting(awaiting)
    game.onPublic = event => this.tracker.observe(event)
  }

  #isBot(pid) {
    const player = this.#game.getPlayer(pid)
    return !!player?.is_bot && !player.removed
  }

  #hasHumans() { return this.#game.players.some(p => p?.id && !p.is_bot && !p.removed) }

  #onAwaiting({ pid, kind, trade_id }) {
    if (!this.#isBot(pid)) return
    if (this.#needs_humans && !this.#hasHumans()) return
    this.#schedule({ pid, kind, trade_id })
  }

  #delay(kind) {
    const game = this.#game
    const configured = this.#delay_ms ?? game.config.bot_delay_ms
    let delay = configured ?? (900 + Math.random() * 900)
    if (game.config.timer) {
      // Always inside the phase timer: half of what is left, so a chain of actions converges
      const left = game.timer_left_ms || (game.config[PHASE_TIME[kind]] ?? Infinity) * 1000
      delay = Math.min(delay, left / 2)
    }
    return Math.max(0, delay)
  }

  /** Where the game is: a tick scheduled at one point does nothing once it has moved on */
  #token() {
    const game = this.#game
    return { turn: game.turn, state: game.state, active_pid: game.active_pid, builder_pid: game.builder_pid }
  }
  #sameToken(a, b) {
    return a.turn === b.turn && a.state === b.state && a.active_pid === b.active_pid && a.builder_pid === b.builder_pid
  }

  #schedule(job) {
    const token = this.#token()
    const timer = setTimeout(() => this.#tick(job, token), this.#delay(job.kind))
    timer.unref?.() // a pending bot move never keeps the process alive
  }

  #tick(job, token) {
    const game = this.#game
    try {
      if (game.ending || game.state === ST.END) return
      if (!this.#sameToken(token, this.#token())) return
      if (!this.#isBot(job.pid)) return
      if (this.#needs_humans && !this.#hasHumans()) return

      // Own trade request open: give the table time to answer before playing on
      if (job.kind === KINDS.PLAYER_ACTIONS && this.#waitingOnProposal(job.pid)) { return this.#schedule(job) }

      // The active seat too: a bot gets a building window after every other player's turn
      const key = `${token.turn}|${token.state}|${token.active_pid}|${job.pid}|${job.trade_id ?? ''}`
      const count = (this.#actions.get(key) || 0) + 1
      if (this.#actions.size > 64) { this.#actions.clear() }
      this.#actions.set(key, count)
      if (count > ACTION_CAP + 1) return // even the fallback did not move the game: leave it to the timer
      if (count > ACTION_CAP) { this.#fallback(job) }
      else {
        try { this.#act(job) }
        catch (e) {
          this.#onError(job.pid, e)
          this.#fallback(job)
        }
      }
      // Same turn, same state, same seat: there is more to do (next build, roll after a knight)
      const same = this.#sameToken(token, this.#token())
      if (same && job.kind !== KINDS.TRADE_REQ && job.kind !== KINDS.ROBBER_DROP && !game.ending) {
        this.#schedule(job)
      }
    } catch (e) {
      // The fallback itself failed. Nothing left to try; the turn timer (if any) moves the game on.
      this.stats.errors++
      console.error(`[${game.id}] bot ${job.pid} fallback failed`, e)
    }
  }

  /** True while the bot's own request is open and its wait has not run out; books the outcome. */
  #waitingOnProposal(pid) {
    const game = this.#game
    const open = this.#proposals.get(pid)
    if (!open || open.turn !== game.turn) return false
    const trade = game.ongoing_trades[open.trade_id]
    if (!trade || trade.status !== 'open') {
      if (trade?.status === 'success') { this.stats.accepted++ }
      else if (trade) { this.stats.refused++; open.refused.add(open.key) }
      open.trade_id = null
      return false
    }
    // Everyone still in the game has said no, or the wait is over
    return Date.now() < open.until
  }

  /** Pairs this bot asked for and was refused this turn - it does not ask twice */
  #refusedThisTurn(pid) {
    const open = this.#proposals.get(pid)
    return open?.turn === this.#game.turn ? open.refused : new Set()
  }

  #tradeWait() {
    const game = this.#game
    if (this.#trade_wait_ms !== undefined) return this.#trade_wait_ms
    if (!this.#hasHumans()) return 0
    let wait = game.config.bot_trade_wait_ms ?? CONST.GAME_CONFIG.bot_trade_wait_ms ?? 8000
    // Never past the turn timer: leave room to play on after the answers
    if (game.config.timer && game.timer_left_ms) { wait = Math.min(wait, game.timer_left_ms / 2) }
    return Math.max(0, wait)
  }

  #onError(pid, e) {
    const game = this.#game
    this.stats.errors++
    const errors = (this.#errors.get(pid) || 0) + 1
    this.#errors.set(pid, errors)
    console.error(`[${game.id}] bot ${pid} failed on turn ${game.turn} (${game.state})`, e)
    const player = game.getPlayer(pid)
    if (errors >= ERRORS_BEFORE_EASY && player && player.bot_level !== 'easy') {
      console.warn(`[${game.id}] bot ${pid} drops to easy after ${errors} errors`)
      player.bot_level = 'easy'
      this.stats.demoted++
    }
  }

  #act(job) {
    const game = this.#game
    const { pid, kind } = job
    const player = game.getPlayer(pid)
    const expected = kind === KINDS.ROBBER_DROP
      && game.expected_actions.find(a => a.type === ST.ROBBER_DROP && a.pid === pid)
    if (kind === KINDS.ROBBER_DROP && !expected) return
    const view = buildView(game, pid)
    if (player.bot_level === 'tryhard') {
      // The count is theirs alone: built from public events, reconciled to public card counts
      this.tracker.reconcile(view.players)
      const prod = Object.fromEntries(view.players.map(p => [p.id, production(view.board, p)]))
      view.counted = this.tracker.snapshot(prod)
    }
    const proposals = this.#proposals.get(pid)
    const moves = legalMoves(view, kind, {
      trade_id: job.trade_id, drop_count: expected?.drop_count,
      can_propose: kind === KINDS.PLAYER_ACTIONS && game.config.bot_trades !== false
        && (proposals?.turn !== game.turn || proposals.asked < (game.config.bot_trade_asks ?? 1)),
      refused: this.#refusedThisTurn(pid),
    })
    if (!moves.length) {
      if (kind === KINDS.TRADE_REQ) return // settled before the bot got to it
      throw new Error(`no legal move for ${kind}`)
    }
    const evaluate = this.#evaluators[player.bot_level] || this.#evaluators.easy
    const run = () => {
      const started = performance.now()
      try { return evaluate(view, moves) }
      finally { this.stats.evaluate_ms += performance.now() - started; this.stats.evaluations++ }
    }
    const intent = this.#onEvaluate ? this.#onEvaluate(run, { game, pid, kind }) : run()
    if (!intent?.type) { throw new Error(`evaluator returned no intent for ${kind}`) }
    this.stats.actions++
    this.#perform(pid, intent)
  }

  /** Intent -> the same `*IO` call a human's socket makes */
  #perform(pid, intent) {
    const game = this.#game
    switch (intent.type) {
      case 'initial_build': return game.initialBuildIO(pid, intent.settlement_loc, intent.road_loc)
      case 'roll': return game.playerRollIO(pid)
      case 'build':
        return game.clickedLocationIO(pid, intent.piece === 'R' ? CONST.LOCS.EDGE : CONST.LOCS.CORNER, intent.loc)
      case 'buy_dev': return game.buyDevCardIO(pid)
      case 'bank_trade': return game.tradeRequestIO(pid, intent.offer, intent.giving, intent.taking)
      case 'player_trade': {
        const before = game.ongoing_trades.length
        game.tradeRequestIO(pid, 'Px', intent.giving, intent.taking)
        if (game.ongoing_trades.length === before) return // refused by the rules: nothing to wait for
        this.stats.proposed++
        const open = this.#proposals.get(pid)
        const same_turn = open?.turn === game.turn
        this.#proposals.set(pid, {
          turn: game.turn, asked: (same_turn ? open.asked : 0) + 1, trade_id: before,
          refused: same_turn ? open.refused : new Set(),
          key: tradeKey(intent.giving, intent.taking), until: Date.now() + this.#tradeWait(),
        })
        return
      }
      case 'knight': return game.knightMoveIO(pid, intent.tile_id, intent.stolen_pid)
      case 'road_building': return game.roadBuildingIO(pid, intent.r1, intent.r2)
      case 'year_of_plenty': return game.yearOfPlentyIO(pid, intent.res1, intent.res2)
      case 'monopoly': return game.monopolyIO(pid, intent.res)
      case 'end_turn': return game.endTurnIO(pid)
      case 'discard': return game.robberDropIO(pid, intent.resources || {})
      case 'robber': return game.robberMoveIO(pid, intent.tile_id, intent.stolen_pid)
      case 'trade_response': return game.tradeResponseIO(pid, intent.id, !!intent.accepted)
      default: throw new Error(`unknown intent ${intent.type}`)
    }
  }

  /** The cheapest legal way out: end the turn, roll, or empty input so the server picks at random */
  #fallback({ pid, kind, trade_id }) {
    const game = this.#game
    this.stats.fallbacks++
    switch (kind) {
      case KINDS.INITIAL_SETUP: return game.initialBuildIO(pid)
      case KINDS.PLAYER_ROLL: return game.playerRollIO(pid)
      case KINDS.PLAYER_ACTIONS: return game.endTurnIO(pid)
      case KINDS.SPECIAL_BUILD: return game.endTurnIO(pid)
      case KINDS.ROBBER_DROP: return game.robberDropIO(pid, {})
      case KINDS.ROBBER_MOVE: return game.robberMoveIO(pid)
      case KINDS.TRADE_REQ: return game.tradeResponseIO(pid, trade_id, false)
    }
  }
}

/** One string per `(giving, asking)` pair, so a refused ask is not repeated in the turn */
export const tradeKey = (giving, taking) => JSON.stringify([giving, taking])

/** Give a game its bots. Every `Game` the server creates goes through here. */
export const attachBots = (game, opts) => new BotController(game, opts)
