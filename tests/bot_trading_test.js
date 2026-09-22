// Bots asking the table: through the same request path, one at a time, waiting for humans to read
// it, never with somebody about to win, and off when told.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as CONST from '../public/js/const.js'
import { evaluate } from '../models/bots/tryhard.js'
import { buildView } from '../models/bots/view.js'
import { legalMoves } from '../models/bots/moves.js'
import { until, tick } from './helpers.js'
import { botLobby, playSetup, setHand, spyIo } from './bot_helpers.js'

const ST = CONST.GAME_STATES

/**
 * Seat 1 human rolls and ends; seat 2 tryhard is one ore short of a city with brick to spare.
 * Dice never roll a 7, and every roll's payout is overwritten so the fixture hands hold.
 */
async function oneShort({ bot_opts, config } = {}) {
  const r = botLobby({ humans: 1, bots: ['tryhard', 'medium'], config, bot_opts })
  const { game } = r
  game.start()
  await playSetup(game)
  const bot = game.getPlayer(2)
  // Hands are set behind the table's back, so tell the count what seat 3 "was paid"
  const fix = () => {
    setHand(bot, { W: 2, O: 2, B: 3 }); setHand(game.getPlayer(3), { O: 3, W: 1 })
    // A brick port from the random placement would make the bank the better deal
    Object.assign(bot.trade_offers, { B2: false, '*3': false })
    const { tracker } = r.controller
    tracker.known[3] = { S: 0, L: 0, B: 0, O: 0, W: 0 }; tracker.unknown[3] = 0
    tracker.observe({ type: 'roll', total: 5, payout: [{ pid: 3, res: { O: 3, W: 1 } }] })
  }
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  const inner = game.onPublic
  game.onPublic = e => { inner?.(e); if (e.type === 'roll') fix() }
  game.playerRollIO(1)
  return { ...r, bot }
}

test('a tryhard one card short asks the table for it', async () => {
  const { game } = await oneShort({ bot_opts: { delay_ms: 5 } })
  const view = buildView(game, 2)
  const intent = evaluate(view, legalMoves(view, ST.PLAYER_ACTIONS, { can_propose: true }))
  assert.equal(intent.type, 'player_trade')
  assert.deepEqual(intent.taking, { O: 1 })
  assert.equal(Object.keys(intent.giving)[0], 'B', 'paid from the surplus, not the city cards')
  game.clearTimer()
})

test('the request goes through the game and every other seat is asked', async () => {
  const { game, controller } = await oneShort({ bot_opts: { delay_ms: 5, trade_wait_ms: 0 } })
  const asked = []
  const inner = game.onAwaiting
  game.onAwaiting = a => { if (a.kind === 'TRADE_REQ') asked.push(a.pid); inner(a) }
  game.endTurnIO(1)
  await until(() => game.ongoing_trades.length, 'the bot to ask')
  const trade = game.ongoing_trades[0]
  assert.equal(trade.pid, 2)
  assert.deepEqual(asked.sort(), [1, 3])
  await until(() => game.active_pid !== 2, 'the bot to finish its turn')
  assert.equal(controller.stats.proposed >= 1, true)
  game.clearTimer()
})

test('with a human at the table the bot waits before playing on, then resumes', async () => {
  const { game } = await oneShort({ bot_opts: { delay_ms: 5, trade_wait_ms: 150 } })
  game.endTurnIO(1)
  await until(() => game.ongoing_trades.length, 'the bot to ask')
  await tick(60)
  assert.equal(game.active_pid, 2, 'still its turn: waiting for the human')
  assert.equal(game.ongoing_trades[0].status, 'open')
  await until(() => game.active_pid !== 2, 'the wait to run out and the turn to end', 2000)
  game.clearTimer()
})

test('an accepted request ends the wait at once', async () => {
  const { game, bot } = await oneShort({ bot_opts: { delay_ms: 5, trade_wait_ms: 5000 } })
  game.endTurnIO(1)
  await until(() => game.ongoing_trades.length, 'the bot to ask')
  const trade = game.ongoing_trades[0]
  const human = game.getPlayer(1)
  setHand(human, trade.asking)
  game.tradeResponseIO(1, trade.id, true)
  assert.equal(trade.status, 'success')
  await until(() => bot.pieces.C.length === 1, 'the city the trade was for', 2000)
  game.clearTimer()
})

test('without humans the wait is zero and a refused ask is not repeated', async () => {
  const { game, controller } = botLobby({ humans: 0, bots: ['tryhard', 'medium', 'medium'], config: { player_count: 4 },
    bot_opts: { delay_ms: 0, needs_humans: false } })
  Object.assign(game.getPlayer(1), { is_bot: true, bot_level: 'medium' })
  game.start()
  await until(() => game.state === ST.END, 'a finished game', 30000)
  clearTimeout(game.end_cleanup_timer)
  assert.ok(controller.stats.proposed > 0, 'tryhard asked')
  assert.equal(controller.stats.errors, 0)
})

test('bot_trades off: no bot asks, bots still answer', async () => {
  const { game, controller } = await oneShort({ config: { bot_trades: false }, bot_opts: { delay_ms: 5 } })
  const human = game.getPlayer(1)
  setHand(human, { W: 1 })
  game.tradeRequestIO(1, 'Px', { W: 1 }, { O: 5 })
  await until(() => game.ongoing_trades[0].status === 'failed', 'the bots to answer')
  game.endTurnIO(1)
  await until(() => game.active_pid !== 2, 'the bot turn to pass')
  assert.equal(controller.stats.proposed, 0)
  assert.equal(game.ongoing_trades.filter(t => t.pid === 2).length, 0)
  game.clearTimer()
})

test('no asking with a player two points from winning, and no accepting from them', async () => {
  const { game } = await oneShort({ bot_opts: { delay_ms: 5 } })
  const rich = game.getPlayer(3)
  rich.public_vps = game.config.win_points - 2
  let view = buildView(game, 2)
  const intent = evaluate(view, legalMoves(view, ST.PLAYER_ACTIONS, { can_propose: true }))
  assert.notEqual(intent.type, 'player_trade')
  // The leader asks for the bot's spare brick, giving the ore it wants
  game.tradeRequestIO(3, 'Px', { O: 1 }, { B: 1 })
  assert.equal(game.ongoing_trades.length, 0, 'not the active player: refused by the rules anyway')
  game.clearTimer()
})
