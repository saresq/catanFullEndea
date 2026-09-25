// How bots play: only from a player view, only in turn, one action per tick, never taking the
// process down, and always answering a trade.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import { attachBots, ACTION_CAP } from '../models/bots/controller.js'
import { buildView } from '../models/bots/view.js'
import { legalMoves } from '../models/bots/moves.js'
import * as CONST from '../public/js/const.js'
import { until, tick, rollOff } from './helpers.js'
import { botLobby, playSetup, setHand, spyIo } from './bot_helpers.js'

const ST = CONST.GAME_STATES
const quiet = async fn => {
  const { error, warn } = console
  console.error = console.warn = () => {}
  try { return await fn() } finally { Object.assign(console, { error, warn }) }
}

test('the view carries no hidden fields', async () => {
  const { game } = botLobby({ humans: 1, bots: ['easy', 'medium'] })
  game.start()
  await playSetup(game)
  game.getPlayer(1).giveCards({ O: 3, dK: 1 })
  const view = buildView(game, 2)
  assert.equal(view.pid, 2)
  assert.ok(view.me.closed_cards, 'own hand')
  for (const p of view.players) {
    assert.equal(p.closed_cards, undefined, `player ${p.id}: no hand`)
    assert.equal(p.private_vps, undefined)
    assert.equal(p.turn_bought_dc, undefined)
  }
  assert.equal(typeof view.dev_cards_len, 'number')
  assert.equal(view.dev_cards, undefined, 'deck only as a count')
  assert.equal(view.dice, undefined)
  view.me.closed_cards.O = 99
  assert.notEqual(game.getPlayer(2).closed_cards.O, 99, 'the view is a copy')
  game.clearTimer()
})

test('four easy bots finish a game headless with the timer off', async () => {
  let ended = 0
  const { game, controller } = botLobby({ humans: 0, bots: ['easy', 'easy', 'easy', 'easy'],
    bot_opts: { needs_humans: false }, onGameEnd: () => ended++ })
  // botLobby seats a human host; make seat 1 a bot too
  Object.assign(game.getPlayer(1), { is_bot: true, bot_level: 'easy' })
  game.start()
  await until(() => game.state === ST.END, 'a winner', 30000)
  clearTimeout(game.end_cleanup_timer)
  assert.ok(game.end_context.pid >= 1)
  assert.equal(controller.stats.errors, 0)
  assert.equal(ended, 0)
})

test('a stale tick is dropped: the bot never acts out of turn', async () => {
  let evaluations = 0
  const { game } = botLobby({ humans: 1, bots: ['easy'], config: { player_count: 3 },
    bot_opts: { delay_ms: 30, evaluators: { easy: (view, moves) => { evaluations++; return moves[0] } } } })
  game.join('Human 3')
  game.start()
  rollOff(game)
  // Seat 1 places, the bot's tick is now scheduled for seat 2 on turn 1...
  game.initialBuildIO(1)
  assert.equal(game.active_pid, 2)
  // ...but the server (timer) resolves the placement first, as a turn timer does
  game.initialBuildIO(2) // placed by the bot's seat id, i.e. what the timeout path does
  assert.equal(game.active_pid, 3)
  const pieces = game.getPlayer(2).pieces.S.length
  await tick(80)
  assert.equal(evaluations, 0, 'the scheduled tick found a different active seat and did nothing')
  assert.equal(game.getPlayer(2).pieces.S.length, pieces)
  assert.equal(game.active_pid, 3)
})

test('a throwing evaluator costs the bot its turn, not the process', async () => {
  const { game, controller } = await quiet(async () => {
    const { game, controller } = botLobby({ humans: 1, bots: ['medium'],
      bot_opts: { evaluators: { medium: () => { throw new Error('boom') } } } })
    game.start()
    await playSetup(game) // the bot's placements fall back to random
    assert.equal(game.getPlayer(2).pieces.S.length, 2, 'the fallback placed for it')
    game.playerRollIO(1)
    game.endTurnIO(1)
    await until(() => game.active_pid === 1 && game.state === ST.PLAYER_ROLL, 'the bot to roll and end its turn')
    return { game, controller }
  })
  assert.ok(controller.stats.errors >= 3)
  assert.ok(controller.stats.fallbacks >= 3)
  assert.equal(game.getPlayer(2).bot_level, 'easy', 'dropped to easy after three errors')
})

test('a turn is capped even when the evaluator never ends it', async () => {
  let asked = 0
  const { game, controller } = botLobby({ humans: 1, bots: ['easy'],
    bot_opts: { evaluators: { easy: (view, moves) => {
      // Actions phase: always a trade it cannot pay for, never end_turn
      if (moves.some(m => m.type === 'end_turn')) { asked++; return { type: 'bank_trade', offer: '*4', giving: { L: 4 }, taking: { O: 1 } } }
      return moves[0]
    } } } })
  game.start()
  await playSetup(game)
  game.playerRollIO(1); game.endTurnIO(1)
  await until(() => game.active_pid === 1 && game.state === ST.PLAYER_ROLL, 'the bot\'s turn to end')
  assert.ok(asked <= ACTION_CAP + 1 && asked >= ACTION_CAP, `capped at ${ACTION_CAP}, got ${asked}`)
  assert.equal(controller.stats.fallbacks, 1)
})

test('bots go through the same validation: no city without the cards', async () => {
  const { game } = botLobby({ humans: 1, bots: ['easy'],
    bot_opts: { evaluators: { easy: (view, moves) => moves[0].type === 'roll' ? moves[0]
      : moves.find(m => m.type === 'end_turn') ? { type: 'build', piece: 'C', loc: view.me.pieces.S[0] } : moves[0] } } })
  game.start()
  await playSetup(game)
  const bot = game.getPlayer(2)
  setHand(bot, {})
  game.playerRollIO(1); game.endTurnIO(1)
  await until(() => game.active_pid === 1 && game.state === ST.PLAYER_ROLL, 'the bot\'s turn to end')
  assert.equal(bot.pieces.C.length, 0)
})

test('bots answer trades so a request nobody wants fails', async () => {
  const { game } = botLobby({ humans: 1, bots: ['medium', 'medium'] })
  game.start()
  await playSetup(game)
  game.playerRollIO(1)
  if (game.state !== ST.PLAYER_ACTIONS) return game.clearTimer()
  const me = game.getPlayer(1)
  setHand(me, { W: 1 })
  game.getPlayer(2).giveCards({ O: 5 }); game.getPlayer(3).giveCards({ O: 5 })
  // A rotten deal: one wheat for five ore
  game.tradeRequestIO(1, 'Px', { W: 1 }, { O: 5 })
  const trade = game.ongoing_trades[0]
  await until(() => trade.status === 'failed', 'every bot to reject')
  assert.deepEqual(trade.rejected.sort(), [2, 3])
})

test('discards on a seven happen without a timer', async () => {
  const { game } = botLobby({ humans: 1, bots: ['easy', 'medium'] })
  game.start()
  await playSetup(game)
  game.getPlayer(2).giveCards({ L: 10 }); game.getPlayer(3).giveCards({ B: 10 })
  game.dice = { roll: () => ({ d1: 3, d2: 4 }) }
  game.playerRollIO(1)
  assert.equal(game.state, ST.ROBBER_DROP)
  await until(() => game.state === ST.ROBBER_MOVE, 'both bots to discard')
  assert.ok(game.getPlayer(2).resource_count <= 7)
  assert.ok(game.getPlayer(3).resource_count <= 7)
})

test('an easy bot builds when it can afford something', async () => {
  const { game } = botLobby({ humans: 1, bots: ['easy'] })
  game.start()
  await playSetup(game)
  const bot = game.getPlayer(2)
  setHand(bot, { L: 1, B: 1, W: 1, S: 1, O: 0 })
  const roads = bot.pieces.R.length, settlements = bot.pieces.S.length
  game.playerRollIO(1); game.endTurnIO(1)
  await until(() => game.active_pid === 1 && game.state === ST.PLAYER_ROLL, 'the bot\'s turn to end')
  assert.ok(bot.pieces.R.length > roads || bot.pieces.S.length > settlements, 'it built something')
})

test('legal moves match what the server accepts', async () => {
  const { game } = botLobby({ humans: 2 })
  game.start()
  await playSetup(game)
  game.playerRollIO(1)
  const me = game.getPlayer(1)
  setHand(me, { L: 4, B: 1, W: 2, S: 1, O: 3 })
  const view = buildView(game, 1)
  const moves = legalMoves(view, ST.PLAYER_ACTIONS)
  assert.ok(moves.some(m => m.type === 'build' && m.piece === 'C'))
  // Four lumber trade at the best rate owned: 4:1, or a port the random placement landed on
  const rate = me.trade_offers.L2 ? 2 : me.trade_offers['*3'] ? 3 : 4
  assert.ok(moves.some(m => m.type === 'bank_trade' && m.giving.L === rate))
  assert.ok(!moves.some(m => m.type === 'bank_trade' && m.giving.O === 4), 'not enough ore for the 4:1')
  assert.ok(moves.some(m => m.type === 'end_turn'))
  game.clearTimer()
})
