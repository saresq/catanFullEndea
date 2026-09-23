// Bots in special building windows: build or buy with their usual priorities, never trade or play
// a card, pass when done, and never act in a window that is no longer theirs.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import { buildView } from '../models/bots/view.js'
import { legalMoves } from '../models/bots/moves.js'
import { evaluate as easy } from '../models/bots/easy.js'
import { evaluate as medium } from '../models/bots/medium.js'
import { evaluate as tryhard } from '../models/bots/tryhard.js'
import * as CONST from '../public/js/const.js'
import { until, tick } from './helpers.js'
import { botLobby, playSetup, setHand, spyIo } from './bot_helpers.js'

const ST = CONST.GAME_STATES

test('window moves are builds, dev card buys and pass; every level picks one of them', () => {
  const game = new Game({
    id: 'sb-moves', io: spyIo().io, host: { id: 1, name: 'P1' },
    config: { player_count: 5, timer: false }, onGameEnd: () => {},
  })
  for (let i = 2; i <= 5; i++) { game.join('P' + i) }
  game.start()
  let guard = 0
  while (game.state === ST.INITIAL_SETUP && guard++ < 40) { game.initialBuildIO(game.active_pid) }
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  game.playerRollIO(1)
  // A city short of one wheat, with lumber to spare: in a turn that is a bank trade
  game.players.forEach(p => setHand(p, p.id === 2 ? { L: 5, B: 1, W: 1, O: 3, dK: 1 } : {}))
  game.getPlayer(2).can_play_dc = true
  game.endTurnIO(1)
  assert.equal(game.builder_pid, 2)

  const view = buildView(game, 2)
  const moves = legalMoves(view, ST.SPECIAL_BUILD)
  const types = new Set(moves.map(m => m.type))
  assert.deepEqual([...types].sort(), ['build', 'end_turn'], 'a road only: no trade, no knight')
  for (const [level, evaluate] of Object.entries({ easy, medium, tryhard })) {
    for (let i = 0; i < 20; i++) {
      const intent = evaluate(buildView(game, 2), moves)
      assert.ok(moves.some(m => JSON.stringify(m) === JSON.stringify(intent))
        || (intent.type === 'build' && moves.some(m => m.type === 'build' && m.piece === intent.piece && m.loc === intent.loc)),
        `${level} picked a listed move, got ${JSON.stringify(intent)}`)
    }
  }
})

test('a medium bot builds a city in its window, then passes', async () => {
  const log = []
  const { game } = botLobby({ humans: 1, bots: ['medium', 'medium', 'medium', 'medium'], bot_opts: {
    trade_wait_ms: 0,
    onEvaluate: (run, { pid, kind }) => {
      const intent = run()
      if (kind === ST.SPECIAL_BUILD) { log.push([pid, intent.type, intent.piece]) }
      return intent
    },
  } })
  game.start()
  await playSetup(game)
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  game.playerRollIO(1)
  game.players.forEach(p => setHand(p, p.id === 2 ? { W: 2, O: 3 } : {}))
  game.endTurnIO(1)
  assert.equal(game.builder_pid, 2)
  await until(() => game.state !== ST.SPECIAL_BUILD, 'the bot to pass')
  // Later windows (after the bot's own turn) may already be logged by now
  assert.deepEqual(log.slice(0, 2), [[2, 'build', 'C'], [2, 'end_turn', undefined]])
  assert.ok(game.getPlayer(2).pieces.C.length >= 1)
})

test('a stale window tick is dropped', async () => {
  let evaluations = 0
  const { game } = botLobby({ humans: 1, bots: ['easy'], config: { player_count: 5 },
    bot_opts: { delay_ms: 30, evaluators: { easy: (view, moves) => { evaluations++; return moves[0] } } } })
  ;['Human 3', 'Human 4', 'Human 5'].forEach(n => game.join(n))
  game.start()
  await playSetup(game)
  await until(() => game.state === ST.PLAYER_ROLL, 'the first roll')
  evaluations = 0
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  game.playerRollIO(1)
  game.players.forEach(p => setHand(p, [2, 3].includes(p.id) ? { L: 1, B: 1 } : {}))
  game.endTurnIO(1)
  assert.equal(game.builder_pid, 2) // the bot's tick is scheduled...
  game.endTurnIO(2) // ...but the window closes first, as its timer does
  assert.equal(game.builder_pid, 3)
  const roads = game.getPlayer(2).pieces.R.length
  await tick(80)
  assert.equal(evaluations, 0, 'the tick found another builder and did nothing')
  assert.equal(game.getPlayer(2).pieces.R.length, roads)
  assert.equal(game.builder_pid, 3)
})

test('one human and five bots, timer off: the game never waits on a bot', async () => {
  let windows = 0
  const { game, controller } = botLobby({ humans: 1, bots: ['easy', 'medium', 'tryhard', 'medium', 'easy'], bot_opts: {
    trade_wait_ms: 0,
    onEvaluate: (run, { kind }) => { if (kind === ST.SPECIAL_BUILD) { windows++ } return run() },
  } })
  game.start()
  await playSetup(game)
  // The human plays its part at once; everything else is up to the bots
  await until(() => {
    if (game.state === ST.END || game.turn >= 8) return true
    const human = 1
    if (game.state === ST.SPECIAL_BUILD && game.builder_pid === human) { game.endTurnIO(human) }
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
  assert.ok(windows > 0, 'bots took building windows')
})
