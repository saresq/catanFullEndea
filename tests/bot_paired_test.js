// Bots as paired player: the own actions-phase logic - build, buy, play a card, trade with the
// bank - minus player trade requests, then end the phase; and never act in a phase no longer theirs.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import { attachBots } from '../models/bots/controller.js'
import { buildView } from '../models/bots/view.js'
import { legalMoves, KINDS } from '../models/bots/moves.js'
import { evaluate as tryhard } from '../models/bots/tryhard.js'
import * as CONST from '../public/js/const.js'
import { until, tick, playToFirstRoll } from './helpers.js'
import { botLobby, playSetup, setHand, spyIo } from './bot_helpers.js'

const ST = CONST.GAME_STATES

/** Five humans in seat 1's actions phase, seat 4 dealt `hand`, then the turn ended: seat 4's phase. */
function phaseFor4(hand) {
  const game = new Game({
    id: 'paired-moves', io: spyIo().io, host: { id: 1, name: 'P1' },
    config: { player_count: 5, timer: false }, onGameEnd: () => {},
  })
  for (let i = 2; i <= 5; i++) { game.join('P' + i) }
  playToFirstRoll(game)
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  game.playerRollIO(1)
  game.players.forEach(p => setHand(p, p.id === 4 ? hand : {}))
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  return game
}

test('phase moves are the actions-phase moves without a player trade request', () => {
  const game = phaseFor4({ L: 5, B: 1, W: 1, O: 3, dK: 1 })
  const view = buildView(game, 4)
  const moves = legalMoves(view, KINDS.PAIRED_ACTIONS, { can_propose: true })
  const types = new Set(moves.map(m => m.type))
  assert.ok(types.has('build') && types.has('bank_trade') && types.has('knight') && types.has('end_turn'))
  assert.ok(!types.has('player_trade'), 'no request in the phase')
})

test('tryhard opens no request in the phase; one card short it trades with the bank', () => {
  const game = phaseFor4({ L: 6, B: 0, W: 2, O: 3 }) // a city is one build away; a road wants brick
  const view = buildView(game, 4)
  const moves = legalMoves(view, KINDS.PAIRED_ACTIONS, { can_propose: true })
  for (let i = 0; i < 10; i++) {
    const intent = tryhard(view, moves)
    assert.notEqual(intent.type, 'player_trade')
    assert.ok(moves.some(m => JSON.stringify(m) === JSON.stringify(intent)) || intent.type === 'build', JSON.stringify(intent))
  }
})

test('a medium bot builds a city in its phase, then ends it', async () => {
  const log = []
  const { game } = botLobby({ humans: 1, bots: ['medium', 'medium', 'medium', 'medium'], bot_opts: {
    trade_wait_ms: 0,
    onEvaluate: (run, { pid, kind }) => {
      const intent = run()
      if (kind === ST.PAIRED_ACTIONS) { log.push([pid, intent.type, intent.piece]) }
      return intent
    },
  } })
  game.start()
  await playSetup(game)
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  game.playerRollIO(1)
  game.players.forEach(p => setHand(p, p.id === 4 ? { W: 2, O: 3 } : {}))
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  await until(() => game.state !== ST.PAIRED_ACTIONS, 'the bot to end its phase')
  assert.deepEqual(log.slice(0, 2), [[4, 'build', 'C'], [4, 'end_turn', undefined]])
  assert.ok(game.getPlayer(4).pieces.C.length >= 1)
})

test('a stale phase tick is dropped', async () => {
  let evaluations = 0
  const { game } = botLobby({ humans: 1, bots: ['easy'], config: { player_count: 5 },
    bot_opts: { delay_ms: 30, trade_wait_ms: 0, evaluators: { easy: (view, moves) => { evaluations++; return moves[0] } } } })
  // The bot is seat 2; humans fill the rest, so the bot's phase comes after seat 4's turn
  ;['Human 3', 'Human 4', 'Human 5'].forEach(n => game.join(n))
  game.start()
  await playSetup(game)
  await until(() => game.state === ST.PLAYER_ROLL, 'the first roll')
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  const humanTurn = () => { game.playerRollIO(game.active_pid); game.players.forEach(p => setHand(p, {})); game.endTurnIO(game.active_pid) }
  // A human partner ends their phase at once, so the bot's turn can pass
  const settle = () => { if (game.state === ST.PAIRED_ACTIONS && !game.getPlayer(game.partner_pid).is_bot) { game.endTurnIO(game.partner_pid) } }
  humanTurn() // seat 1
  await until(() => { settle(); return game.active_pid === 3 }, 'the bot\'s own turn to pass')
  humanTurn() // seat 3
  assert.equal(game.active_pid, 4)
  evaluations = 0
  game.playerRollIO(4)
  game.players.forEach(p => setHand(p, p.id === 2 ? { L: 1, B: 1 } : {}))
  game.endTurnIO(4)
  assert.equal(game.partner_pid, 2) // the bot's tick is scheduled...
  game.endTurnIO(2) // ...but the phase ends first, as its timer would
  assert.equal(game.state, ST.PLAYER_ROLL)
  const roads = game.getPlayer(2).pieces.R.length
  await tick(80)
  assert.equal(evaluations, 0, 'the tick found the phase over and did nothing')
  assert.equal(game.getPlayer(2).pieces.R.length, roads)
})

test('one human and five bots, timer off: the game never waits on a bot', async () => {
  let phases = 0
  const { game, controller } = botLobby({ humans: 1, bots: ['easy', 'medium', 'tryhard', 'medium', 'easy'], bot_opts: {
    trade_wait_ms: 0,
    onEvaluate: (run, { kind }) => { if (kind === ST.PAIRED_ACTIONS) { phases++ } return run() },
  } })
  game.start()
  await playSetup(game)
  // The human plays its part at once; everything else is up to the bots
  await until(() => {
    if (game.state === ST.END || game.turn >= 8) return true
    const human = 1
    if (game.state === ST.PAIRED_ACTIONS && game.partner_pid === human) { game.endTurnIO(human) }
    else if (game.state === ST.ROBBER_DROP && game.robbing_players.includes(human)) { game.robberDropIO(human, {}) }
    else if (game.active_pid === human && game.state === ST.PLAYER_ROLL) { game.playerRollIO(human) }
    else if (game.active_pid === human && game.state === ST.ROBBER_MOVE) { game.robberMoveIO(human) }
    else if (game.active_pid === human && game.state === ST.PLAYER_ACTIONS) {
      game.ongoing_trades.filter(t => t.status === 'open' && t.pid !== human)
        .forEach(t => game.tradeResponseIO(human, t.id, false))
      game.endTurnIO(human)
    } else {
      game.ongoing_trades.filter(t => t.status === 'open' && t.pid !== human && !t.rejected.includes(human))
        .forEach(t => game.tradeResponseIO(human, t.id, false))
    }
  }, 'five rounds', 20000)
  clearTimeout(game.end_cleanup_timer)
  assert.equal(controller.stats.errors, 0)
  assert.ok(phases > 0, 'bots took paired phases')
})

/**
 * Ten seats, three paired phases a turn. Thirty rounds each (some 300 turns and 900 paired
 * phases) with no bot error and no stall. Running them to a winner is not asked: at ten seats the
 * board runs out of spots long before anyone reaches 13 points (TBD 3.1), as it did before.
 */
test('twenty ten-seat games of mixed levels play thirty rounds without bot errors or stalls', async () => {
  const levels = ['easy', 'medium', 'tryhard']
  const ROUNDS = 30
  const io = { to: () => ({ emit: () => {} }) }
  const play = n => new Promise(resolve => {
    const game = new Game({
      id: `ten-${n}`, io, host: { id: 1, name: 'Bot 1' }, onGameEnd: () => {},
      config: { player_count: 10, timer: false },
    })
    Object.assign(game.getPlayer(1), { is_bot: true, bot_level: levels[n % 3] })
    for (let i = 2; i <= 10; i++) { game.join('Bot ' + i, { bot_level: levels[(n + i) % 3] }) }
    const bots = attachBots(game, { delay_ms: 0, needs_humans: false, trade_wait_ms: 0 })
    game.start()
    let last = -1, idle = Date.now()
    const watch = setInterval(() => {
      if (bots.stats.actions !== last) { last = bots.stats.actions; idle = Date.now() }
      const done = game.state === ST.END || game.turn > ROUNDS
      const stalled = !done && !game.ending && Date.now() - idle > 3000
      if (!done && !stalled) return
      clearInterval(watch)
      clearTimeout(game.end_cleanup_timer)
      game.onAwaiting = null
      resolve({ done, stalled, turn: game.turn, errors: bots.stats.errors, state: game.state, waiting: game.acting_pid })
    }, 5)
  })
  const results = await Promise.all(Array.from({ length: 20 }, (_, n) => play(n)))
  results.forEach((r, n) => {
    assert.equal(r.errors, 0, `game ${n}: bot errors`)
    assert.ok(!r.stalled, `game ${n} stalled on turn ${r.turn} in ${r.state}, waiting on seat ${r.waiting}`)
  })
})
