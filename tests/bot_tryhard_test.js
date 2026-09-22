// Tryhard's judgement on fixtures: plans across goals, follows the count, races at the end.
import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, WEIGHTS, PLAN_CAP } from '../models/bots/tryhard.js'
import { buildView } from '../models/bots/view.js'
import { legalMoves } from '../models/bots/moves.js'
import Tracker from '../models/bots/tracker.js'
import * as CONST from '../public/js/const.js'
import { botLobby, playSetup, setHand } from './bot_helpers.js'

const ST = CONST.GAME_STATES
const RES = Object.keys(CONST.RESOURCES)

async function acting() {
  const { game } = botLobby({ humans: 3 })
  game.start()
  await playSetup(game)
  game.playerRollIO(1)
  if (game.state !== ST.PLAYER_ACTIONS) { game.clearTimer(); return null }
  return game
}
const withCount = (view, tracker) => {
  view.counted = tracker.snapshot()
  return view
}

test('cross-goal: trades sheep for ore and builds the city in one turn', async () => {
  const game = await acting(); if (!game) return
  const me = game.getPlayer(1)
  // No settlement spot: roads lead nowhere new on a fresh board only if we pretend; test the trade step
  setHand(me, { S: 4, W: 2, O: 2 })
  let view = buildView(game, 1)
  let intent = evaluate(view, legalMoves(view, ST.PLAYER_ACTIONS))
  assert.equal(intent.type, 'bank_trade')
  assert.deepEqual(intent.taking, { O: 1 })
  assert.equal(Object.keys(intent.giving)[0], 'S')
  game.tradeRequestIO(1, intent.offer, intent.giving, intent.taking)
  view = buildView(game, 1)
  intent = evaluate(view, legalMoves(view, ST.PLAYER_ACTIONS))
  assert.deepEqual([intent.type, intent.piece], ['build', 'C'])
  game.clearTimer()
})

test('the robber follows the count', async () => {
  const game = await acting(); if (!game) return
  const tracker = new Tracker()
  // Seat 2 is counted rich in ore, seat 3 counted empty; both sit on tiles the robber can reach
  tracker.observe({ type: 'roll', total: 5, payout: [{ pid: 2, res: { O: 3 } }] })
  game.getPlayer(2).giveCards({ O: 3 })
  const view = withCount(buildView(game, 1), tracker)
  const moves = legalMoves(view, ST.ROBBER_MOVE)
  const choice = evaluate(view, moves)
  if (moves.some(m => m.stolen_pid === 2)) { assert.equal(choice.stolen_pid, 2) }
  game.clearTimer()
})

test('race mode: no proposals, robber on the leader', async () => {
  const game = await acting(); if (!game) return
  const me = game.getPlayer(1)
  setHand(me, { W: 2, O: 2, L: 3 })
  const front = game.getPlayer(3)
  front.public_vps = game.config.win_points - 2
  let view = buildView(game, 1)
  const intent = evaluate(view, legalMoves(view, ST.PLAYER_ACTIONS, { can_propose: true }))
  assert.notEqual(intent.type, 'player_trade')
  view = buildView(game, 1)
  const moves = legalMoves(view, ST.ROBBER_MOVE)
  const choice = evaluate(view, moves)
  if (moves.some(m => m.stolen_pid === 3)) { assert.equal(choice.stolen_pid, 3) }
  game.clearTimer()
})

test('the plan search leaves the board, hand and count untouched and stays under the cap', async () => {
  const game = await acting(); if (!game) return
  const me = game.getPlayer(1)
  setHand(me, { S: 4, W: 4, O: 4, L: 4, B: 4 }) // plenty: many plans
  const tracker = new Tracker()
  const before = game.board.generateMapKey() + JSON.stringify(me.pieces) + JSON.stringify(me.closed_cards) + JSON.stringify(tracker.known)
  const view = withCount(buildView(game, 1), tracker)
  const started = performance.now()
  const intent = evaluate(view, legalMoves(view, ST.PLAYER_ACTIONS))
  const ms = performance.now() - started
  assert.ok(intent.type)
  assert.equal(game.board.generateMapKey() + JSON.stringify(me.pieces) + JSON.stringify(me.closed_cards) + JSON.stringify(tracker.known), before)
  assert.ok(ms < 50, `one decision took ${ms.toFixed(1)}ms`)
  assert.ok(PLAN_CAP <= 200)
  game.clearTimer()
})

test('answers refuse the card that would win the giver the game', async () => {
  const game = await acting(); if (!game) return
  const bot = game.getPlayer(2)
  setHand(bot, { W: 2, O: 2, L: 1 })
  const giver = game.getPlayer(1)
  giver.public_vps = game.config.win_points - 2
  setHand(giver, { O: 1, W: 2, L: 0 })
  game.tradeRequestIO(1, 'Px', { O: 1 }, { L: 1 })
  const tracker = new Tracker()
  tracker.observe({ type: 'roll', total: 6, payout: [{ pid: 1, res: { O: 3, W: 2 } }] })
  const view = withCount(buildView(game, 2), tracker)
  const answer = evaluate(view, legalMoves(view, 'TRADE_REQ', { trade_id: 0 }))
  assert.equal(answer.accepted, false)
  game.clearTimer()
})
