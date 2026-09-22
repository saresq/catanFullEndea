import * as CONST from '../../public/js/const.js'
import { buildView } from './view.js'
import { legalMoves, KINDS } from './moves.js'
import { evaluate as easy } from './easy.js'
import { evaluate as medium } from './medium.js'

const ST = CONST.GAME_STATES
/** Hard stop for a turn that never ends: past this the bot takes the fallback. */
export const ACTION_CAP = 25
const ERRORS_BEFORE_EASY = 3
/** Phase timer (seconds, from the game config) a delay has to fit inside */
const PHASE_TIME = {
  [ST.INITIAL_SETUP]: 'initial_build_time', [ST.PLAYER_ROLL]: 'roll_time',
  [ST.PLAYER_ACTIONS]: 'player_turn_time', [ST.ROBBER_DROP]: 'robber_drop_time',
  [ST.ROBBER_MOVE]: 'robber_move_time',
}

/**
 * Plays every bot seat of one game. Bots are ordinary callers of the `*IO` methods a human's
 * socket reaches, so every rule check applies to them. The controller never acts inside the
 * game's hook: it schedules a tick, and a tick whose turn / state / active seat has moved on
 * does nothing. One action per tick, every tick wrapped, because a throw inside a timer would
 * take the whole process - every game on the server - down.
 */
export default class BotController {
  /** @type {import('../game.js').default} */ #game
  #evaluators; #delay_ms; #needs_humans; #onEvaluate
  /** action count per `turn|state|pid`, for the cap */
  #actions = new Map()
  #errors = new Map() // pid -> errors this game
  stats = { actions: 0, errors: 0, fallbacks: 0, demoted: 0 }

  /**
   * @param {import('../game.js').default} game
   * @param {object} [opts]
   * @param {number} [opts.delay_ms] fixed delay; default is `config.bot_delay_ms` or 900-1800ms jittered
   * @param {boolean} [opts.needs_humans] stop once no human is left in the game (off in the simulator)
   * @param {Object<string, Function>} [opts.evaluators] level -> evaluate(view, moves)
   * @param {Function} [opts.onEvaluate] wraps every evaluate call: `(run, { game, pid, kind }) => intent`
   */
  constructor(game, { delay_ms, needs_humans = true, evaluators = {}, onEvaluate } = {}) {
    this.#game = game
    this.#delay_ms = delay_ms
    this.#needs_humans = needs_humans
    this.#evaluators = { easy, medium, ...evaluators }
    this.#onEvaluate = onEvaluate
    game.onAwaiting = awaiting => this.#onAwaiting(awaiting)
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

  #schedule(job) {
    const game = this.#game
    const token = { turn: game.turn, state: game.state, active_pid: game.active_pid }
    const timer = setTimeout(() => this.#tick(job, token), this.#delay(job.kind))
    timer.unref?.() // a pending bot move never keeps the process alive
  }

  #tick(job, token) {
    const game = this.#game
    try {
      if (game.ending || game.state === ST.END) return
      if (token.turn !== game.turn || token.state !== game.state || token.active_pid !== game.active_pid) return
      if (!this.#isBot(job.pid)) return
      if (this.#needs_humans && !this.#hasHumans()) return

      const key = `${token.turn}|${token.state}|${job.pid}|${job.trade_id ?? ''}`
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
      const same = token.turn === game.turn && token.state === game.state && token.active_pid === game.active_pid
      if (same && job.kind !== KINDS.TRADE_REQ && job.kind !== KINDS.ROBBER_DROP && !game.ending) {
        this.#schedule(job)
      }
    } catch (e) {
      // The fallback itself failed. Nothing left to try; the turn timer (if any) moves the game on.
      this.stats.errors++
      console.error(`[${game.id}] bot ${job.pid} fallback failed`, e)
    }
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
    const moves = legalMoves(view, kind, { trade_id: job.trade_id, drop_count: expected?.drop_count })
    if (!moves.length) {
      if (kind === KINDS.TRADE_REQ) return // settled before the bot got to it
      throw new Error(`no legal move for ${kind}`)
    }
    const evaluate = this.#evaluators[player.bot_level] || this.#evaluators.easy
    const run = () => evaluate(view, moves)
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
      case KINDS.ROBBER_DROP: return game.robberDropIO(pid, {})
      case KINDS.ROBBER_MOVE: return game.robberMoveIO(pid)
      case KINDS.TRADE_REQ: return game.tradeResponseIO(pid, trade_id, false)
    }
  }
}

/** Give a game its bots. Every `Game` the server creates goes through here. */
export const attachBots = (game, opts) => new BotController(game, opts)
