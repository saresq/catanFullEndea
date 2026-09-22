// The medium bot's judgement on fixtures: placement by probability, trades that serve its goal,
// no gifts to a player about to win.
import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate } from '../models/bots/medium.js'
import { buildView } from '../models/bots/view.js'
import { legalMoves } from '../models/bots/moves.js'
import { pips, cornerPips } from '../models/bots/features.js'
import * as CONST from '../public/js/const.js'
import { botLobby, playSetup, setHand } from './bot_helpers.js'

const ST = CONST.GAME_STATES

// One corner touches 6, 8 and 5 (top row/second row), everything else is 2s, 3s, 11s and 12s.
const FIXTURE = 'S.S.S.S-S.F6.G8.S+S.C5.M2.J11.S-S.F3.G12.S+S.S.S.S'

test('pips follow the dice', () => {
  assert.deepEqual([2, 3, 6, 7, 8, 11, 12].map(pips), [1, 2, 5, 0, 5, 2, 1])
})

test('placement takes the 6-8-5 corner', async () => {
  const { game } = botLobby({ humans: 1, bots: ['medium'], config: { player_count: 2, mapkey: FIXTURE, map_shuffle: 'none' } })
  game.start()
  // Bot is seat 2: the human places somewhere far from the best corner first
  const view0 = buildView(game, 1)
  const worst = legalMoves(view0, ST.INITIAL_SETUP).reduce((m, mv) =>
    cornerPips(game.board.findCorner(mv.settlement_loc)) < cornerPips(game.board.findCorner(m.settlement_loc)) ? mv : m)
  game.initialBuildIO(1, worst.settlement_loc, worst.road_loc)
  const view = buildView(game, 2)
  const moves = legalMoves(view, ST.INITIAL_SETUP)
  const choice = evaluate(view, moves)
  const corner = game.board.findCorner(choice.settlement_loc)
  assert.deepEqual(corner.tiles.map(t => +t.num).filter(Boolean).sort(), [5, 6, 8])
  await playSetup(game)
  game.clearTimer()
})

async function tradeSetup() {
  const { game } = botLobby({ humans: 1, bots: ['medium'], config: { player_count: 3 } })
  game.join('Human 3')
  game.start()
  await playSetup(game)
  game.playerRollIO(1)
  assert.equal(game.state, ST.PLAYER_ACTIONS)
  return game
}

test('accepts a trade that completes its goal', async () => {
  const game = await tradeSetup()
  const bot = game.getPlayer(2)
  setHand(bot, { W: 2, O: 2, L: 1 })  // one ore from a city
  setHand(game.getPlayer(1), { O: 1 })
  game.tradeRequestIO(1, 'Px', { O: 1 }, { L: 1 })
  const trade = game.ongoing_trades[0]
  const view = buildView(game, 2)
  const answer = evaluate(view, legalMoves(view, 'TRADE_REQ', { trade_id: trade.id }))
  assert.equal(answer.accepted, true)
})

test('refuses a trade that sets its goal back', async () => {
  const game = await tradeSetup()
  const bot = game.getPlayer(2)
  setHand(bot, { W: 2, O: 2, L: 1 })
  setHand(game.getPlayer(1), { L: 1 })
  game.tradeRequestIO(1, 'Px', { L: 1 }, { O: 1 })
  const view = buildView(game, 2)
  const answer = evaluate(view, legalMoves(view, 'TRADE_REQ', { trade_id: 0 }))
  assert.equal(answer.accepted, false)
})

test('refuses to feed a player within two points of winning', async () => {
  const game = await tradeSetup()
  const bot = game.getPlayer(2)
  setHand(bot, { W: 2, O: 2, L: 1 })
  const rich = game.getPlayer(1)
  setHand(rich, { O: 1 })
  rich.public_vps = game.config.win_points - 1
  game.tradeRequestIO(1, 'Px', { O: 1 }, { L: 1 })
  const view = buildView(game, 2)
  const answer = evaluate(view, legalMoves(view, 'TRADE_REQ', { trade_id: 0 }))
  assert.equal(answer.accepted, false)
})

test('builds the city when it has the cards, trades toward it when one short', async () => {
  // The evaluator is pure: judged from seat 1's view during its own actions phase
  const game = await tradeSetup()
  const me = game.getPlayer(1)
  setHand(me, { W: 2, O: 3 })
  let view = buildView(game, 1)
  let intent = evaluate(view, legalMoves(view, ST.PLAYER_ACTIONS))
  assert.deepEqual([intent.type, intent.piece], ['build', 'C'])

  setHand(me, { W: 2, O: 2, L: 4 })
  view = buildView(game, 1)
  intent = evaluate(view, legalMoves(view, ST.PLAYER_ACTIONS))
  assert.equal(intent.type, 'bank_trade')
  assert.deepEqual(intent.taking, { O: 1 })
})
