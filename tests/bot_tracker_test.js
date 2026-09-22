// The card counter sees only what the table sees: it may fall short of a real hand, never above
// the public count, and a stolen card stays unknown to it.
import test from 'node:test'
import assert from 'node:assert/strict'
import Tracker from '../models/bots/tracker.js'
import * as CONST from '../public/js/const.js'
import { until, tick } from './helpers.js'
import { botLobby, playSetup, setHand } from './bot_helpers.js'

const ST = CONST.GAME_STATES
const RES = Object.keys(CONST.RESOURCES)

test('a scripted feed never counts more than a player holds, and steals stay unknown', () => {
  const t = new Tracker()
  t.observe({ type: 'roll', total: 8, payout: [{ pid: 2, res: { O: 2, W: 1 } }, { pid: 3, res: { L: 1 } }] })
  t.observe({ type: 'bank_trade', pid: 2, giving: { O: 2 }, taking: { B: 1 } })
  t.observe({ type: 'buy', pid: 3, what: 'R' }) // more than it has: known clamps at zero
  t.observe({ type: 'steal', pid: 3, from: 2 })
  assert.deepEqual(t.known[2], { S: 0, L: 0, B: 0, O: 0, W: 1 }, 'the biggest pile was hit')
  assert.equal(t.unknown[3], 1, 'the stolen card is a card of no known kind')
  assert.equal(t.known[3].L, 0)

  // Reconcile: seat 2 really holds 1 card, seat 3 holds 3 (two the table never saw arrive)
  t.reconcile([{ id: 2, resource_count: 1 }, { id: 3, resource_count: 3 }])
  const totalKnown = pid => RES.reduce((m, r) => m + t.known[pid][r], 0)
  assert.equal(totalKnown(2) + t.unknown[2], 1)
  assert.equal(totalKnown(3) + t.unknown[3], 3)
  assert.equal(t.unknown[3], 3)

  const snap = t.snapshot({ 3: { S: 0, L: 5, B: 0, O: 0, W: 5 } })
  assert.equal(snap.likely(3, 'L'), 1.5, 'unknowns spread by production')
  assert.equal(snap.likely(3, 'B'), 0)
  assert.throws(() => { snap.known[3].L = 9 }, 'a snapshot is frozen')
})

test('monopoly empties everyone else of that resource', () => {
  const t = new Tracker()
  t.observe({ type: 'roll', total: 6, payout: [{ pid: 1, res: { O: 3 } }, { pid: 2, res: { O: 1, W: 1 } }] })
  t.observe({ type: 'monopoly', pid: 3, res: 'O', total: 4 })
  assert.equal(t.known[1].O, 0)
  assert.equal(t.known[2].O, 0)
  assert.equal(t.known[3].O, 4)
})

test('the game feeds the counter and it stays at or below the real hands', async () => {
  const { game, controller } = botLobby({ humans: 1, bots: ['tryhard', 'medium'] })
  game.start()
  await playSetup(game)
  // After the initial yield every bot's known cards match its hand exactly: all of it was public
  game.players.forEach(p => {
    RES.forEach(r => assert.ok(controller.tracker.known[p.id][r] <= p.closed_cards[r], `seat ${p.id} ${r}`))
  })
  const sum = pid => RES.reduce((m, r) => m + controller.tracker.known[pid][r], 0) + controller.tracker.unknown[pid]
  assert.equal(sum(2), game.getPlayer(2).resource_count)
  // A steal from seat 2 by seat 1: the table saw a card move, not which
  setHand(game.getPlayer(2), { O: 2 })
  game.playerRollIO(1)
  if (game.state !== ST.PLAYER_ACTIONS) return game.clearTimer()
  const before_unknown = controller.tracker.unknown[1] || 0
  game.getPlayer(1).giveCards({ dK: 1 }); game.getPlayer(1).can_play_dc = true
  const tile = game.board.getRobbableTiles().find(id => game.board.findTile(id).getAllCorners().some(c => c.player_id === 2))
  game.knightMoveIO(1, tile, 2)
  assert.equal(controller.tracker.unknown[1], before_unknown + 1, 'the thief gained an unknown card')
  game.clearTimer()
})

test('a listener that throws is caught', async () => {
  const { game } = botLobby({ humans: 2 })
  const err = console.error; const logged = []
  console.error = (...a) => logged.push(a)
  try {
    game.onPublic = () => { throw new Error('boom') }
    game.start()
    await playSetup(game)
  } finally { console.error = err }
  assert.ok(logged.some(a => String(a[0]).includes('onPublic')))
  assert.equal(game.state, ST.PLAYER_ROLL, 'the game went on')
  game.clearTimer()
})
