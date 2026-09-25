// Proposals and counters: offers from a player whose turn it is not, that only the active player
// may take. A counter answers one of the active player's requests and takes its author out of it.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { playToFirstRoll } from './helpers.js'
import { setHand, spyIo } from './bot_helpers.js'

const ST = CONST.GAME_STATES
const SOC = CONST.SOCKET_EVENTS

/** `player_count` humans in seat 1's actions phase, timer off unless `config` says otherwise. */
function gameInActions({ player_count = 4, config = {}, events = [] } = {}) {
  const game = new Game({
    id: 'proposals', io: spyIo(events).io, host: { id: 1, name: 'P1' },
    config: { player_count, timer: false, ...config }, onGameEnd: () => {},
  })
  for (let i = 2; i <= player_count; i++) { game.join('P' + i) }
  playToFirstRoll(game)
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  game.board.distribute = () => []
  game.playerRollIO(1)
  assert.equal(game.state, ST.PLAYER_ACTIONS)
  game.players.forEach(p => setHand(p, {}))
  return game
}

test('a proposal to the active player', async t => {
  await t.test('is opened aimed at them, and only they can accept it', () => {
    const game = gameInActions()
    const p1 = game.getPlayer(1), p2 = game.getPlayer(2), p3 = game.getPlayer(3)
    setHand(p1, { O: 1 }); setHand(p2, { O: 1 }); setHand(p3, { B: 1 })
    game.tradeRequestIO(3, 'Px', { B: 1 }, { O: 1 })
    const [trade] = game.ongoing_trades
    assert.ok(trade, 'opened')
    assert.equal(trade.pid, 3)
    assert.equal(trade.to, 1, 'aimed at the active player')
    assert.equal(trade.counter_of, null)

    game.tradeResponseIO(2, 0, true)
    assert.equal(trade.status, 'open', 'a bystander cannot take it')
    assert.equal(p2.closed_cards.B, 0)

    game.tradeResponseIO(1, 0, true)
    assert.equal(trade.status, 'success')
    assert.equal(p1.closed_cards.B, 1); assert.equal(p1.closed_cards.O, 0)
    assert.equal(p3.closed_cards.O, 1); assert.equal(p3.closed_cards.B, 0)
  })

  await t.test('is validated like a request', () => {
    const game = gameInActions()
    setHand(game.getPlayer(3), { B: 1 })
    game.tradeRequestIO(3, 'Px', { B: 1 }, { B: 1 }) // same resource both sides
    game.tradeRequestIO(3, 'Px', { B: 2 }, { O: 1 }) // more than held
    game.tradeRequestIO(3, 'Px', {}, { O: 1 }) // nothing given
    game.tradeRequestIO(3, '*4', { B: 1 }, { O: 1 }) // only the table, never the bank, off-turn
    assert.equal(game.ongoing_trades.length, 0)
  })

  await t.test('ignoring it fails it; the proposer may withdraw it', () => {
    const game = gameInActions()
    setHand(game.getPlayer(3), { B: 2 })
    game.tradeRequestIO(3, 'Px', { B: 1 }, { O: 1 })
    game.tradeRequestIO(3, 'Px', { B: 1 }, { W: 1 })
    game.tradeResponseIO(2, 0, false)
    assert.equal(game.ongoing_trades[0].status, 'open', 'a bystander cannot ignore it either')
    game.tradeResponseIO(1, 0, false)
    assert.equal(game.ongoing_trades[0].status, 'failed')
    game.tradeResponseIO(3, 1, false)
    assert.equal(game.ongoing_trades[1].status, 'deleted')
  })

  await t.test('the active player is told there is something to answer', () => {
    const game = gameInActions()
    const asked = []
    game.onAwaiting = a => asked.push(a)
    setHand(game.getPlayer(3), { B: 1 })
    game.tradeRequestIO(3, 'Px', { B: 1 }, { O: 1 })
    assert.deepEqual(asked, [{ pid: 1, kind: 'TRADE_REQ', trade_id: 0 }])
  })

  await t.test('is refused outside the actions phase', () => {
    const game = gameInActions()
    setHand(game.getPlayer(3), { B: 1 })
    game.endTurnIO(1)
    assert.equal(game.state, ST.PLAYER_ROLL)
    game.tradeRequestIO(3, 'Px', { B: 1 }, { O: 1 })
    assert.equal(game.ongoing_trades.length, 0)
  })

  await t.test('is refused in a paired phase, to the partner and from them', () => {
    const game = gameInActions({ player_count: 5 })
    const rich = { L: 5, B: 5, W: 5, S: 5, O: 5 }
    game.players.forEach(p => setHand(p, rich))
    game.endTurnIO(1)
    assert.equal(game.state, ST.PAIRED_ACTIONS)
    const partner = game.partner_pid
    const other = game.players.find(p => p.id !== partner && p.id !== 1).id
    game.tradeRequestIO(other, 'Px', { B: 1 }, { O: 1 })
    game.tradeRequestIO(partner, 'Px', { B: 1 }, { O: 1 })
    assert.equal(game.ongoing_trades.length, 0)
  })

  await t.test('adds no time to the active player\'s turn', () => {
    const events = []
    const game = gameInActions({ config: { timer: true }, events })
    setHand(game.getPlayer(1), { O: 1 }); setHand(game.getPlayer(3), { B: 1 })
    events.length = 0
    game.tradeRequestIO(3, 'Px', { B: 1 }, { O: 1 })
    assert.equal(game.turn_trade_time_added, false)
    assert.ok(!events.some(([type]) => type === SOC.SET_TIMER), 'the timer was not touched')
    game.tradeRequestIO(1, 'Px', { O: 1 }, { W: 1 })
    assert.equal(game.turn_trade_time_added, true, 'the turn\'s owner still gets the bonus')
    game.clearTimer()
  })

  await t.test('counts against the proposer\'s open offers', () => {
    const game = gameInActions({ config: { max_trade_requests: 1 } })
    setHand(game.getPlayer(3), { B: 3 })
    game.tradeRequestIO(3, 'Px', { B: 1 }, { O: 1 })
    game.tradeRequestIO(3, 'Px', { B: 1 }, { W: 1 })
    assert.equal(game.ongoing_trades.length, 1)
    game.tradeResponseIO(3, 0, false)
    game.tradeRequestIO(3, 'Px', { B: 1 }, { W: 1 })
    assert.equal(game.ongoing_trades.length, 2, 'a withdrawn one frees the slot')
  })

  await t.test('closes when the proposer can no longer pay', () => {
    const game = gameInActions()
    setHand(game.getPlayer(1), { O: 1 }); setHand(game.getPlayer(3), { B: 1 })
    game.tradeRequestIO(3, 'Px', { B: 1 }, { W: 1 })
    game.tradeRequestIO(1, 'Px', { O: 1 }, { B: 1 })
    game.tradeResponseIO(3, 1, true) // the brick goes to seat 1 in another trade
    assert.equal(game.ongoing_trades[0].status, 'closed')
  })

  await t.test('closes when Monopoly or a steal takes the offered card', () => {
    const game = gameInActions()
    const p1 = game.getPlayer(1)
    setHand(game.getPlayer(3), { B: 1 }); setHand(game.getPlayer(2), { L: 1 })
    game.tradeRequestIO(3, 'Px', { B: 1 }, { W: 1 })
    game.tradeRequestIO(2, 'Px', { L: 1 }, { W: 1 })
    p1.giveCards({ dM: 1, dK: 1 })
    p1.can_play_dc = true; game.monopolyIO(1, 'B')
    assert.equal(game.ongoing_trades[0].status, 'closed', 'Monopoly took the brick')
    const tile = game.board.getRobbableTiles().find(id => game.board.findTile(id).getAllCorners().some(c => c.player_id === 2))
    p1.can_play_dc = true; game.knightMoveIO(1, tile, 2)
    assert.equal(game.ongoing_trades[1].status, 'closed', 'the knight stole the lumber')
  })

  await t.test('is cleared when the actions phase ends', () => {
    const game = gameInActions()
    setHand(game.getPlayer(3), { B: 1 })
    game.tradeRequestIO(3, 'Px', { B: 1 }, { O: 1 })
    game.endTurnIO(1)
    game.playerRollIO(2)
    assert.equal(game.ongoing_trades.length, 0)
  })
})

test('a counter to an open request', async t => {
  /** Seat 1 asks 1 ore for 2 wool; seats 2 and 3 hold ore */
  const withRequest = (config) => {
    const game = gameInActions({ config })
    setHand(game.getPlayer(1), { W: 2 }); setHand(game.getPlayer(2), { O: 2 }); setHand(game.getPlayer(3), { O: 2 })
    game.tradeRequestIO(1, 'Px', { W: 2 }, { O: 1 })
    return game
  }

  await t.test('is a proposal linked to the request, and declines it', () => {
    const game = withRequest()
    game.tradeRequestIO(3, 'Px', { O: 1 }, { W: 3 }, 0)
    const [request, counter] = game.ongoing_trades
    assert.equal(counter.to, 1)
    assert.equal(counter.counter_of, 0)
    assert.deepEqual(request.rejected, [3], 'the countering player is out of the request')
    assert.equal(request.status, 'open', 'still open for the others')
    game.tradeResponseIO(2, 1, true)
    assert.equal(counter.status, 'open', 'only the active player takes a counter')
  })

  await t.test('fails the request once everyone has countered or refused', () => {
    const game = withRequest()
    game.tradeRequestIO(3, 'Px', { O: 1 }, { W: 3 }, 0)
    game.tradeResponseIO(2, 0, false)
    game.tradeResponseIO(4, 0, false)
    assert.equal(game.ongoing_trades[0].status, 'failed')
    assert.equal(game.ongoing_trades[1].status, 'open', 'the counter stands')
  })

  await t.test('the active player accepts it', () => {
    const game = withRequest()
    game.tradeRequestIO(3, 'Px', { O: 1 }, { W: 2 }, 0)
    game.tradeResponseIO(1, 1, true)
    assert.equal(game.ongoing_trades[1].status, 'success')
    assert.equal(game.getPlayer(1).closed_cards.O, 1)
    assert.equal(game.getPlayer(3).closed_cards.W, 2)
    assert.equal(game.ongoing_trades[0].status, 'closed', 'the request is now unaffordable')
  })

  await t.test('a second counter replaces the first', () => {
    const game = withRequest()
    game.tradeRequestIO(3, 'Px', { O: 1 }, { W: 3 }, 0)
    game.tradeRequestIO(3, 'Px', { O: 1 }, { W: 2 }, 0)
    assert.equal(game.ongoing_trades[1].status, 'deleted')
    assert.equal(game.ongoing_trades[2].status, 'open')
    assert.deepEqual(game.ongoing_trades[0].rejected, [3], 'counted out once')
  })

  await t.test('withdrawing the request deletes its counters', () => {
    const game = withRequest()
    game.tradeRequestIO(2, 'Px', { O: 1 }, { W: 3 }, 0)
    game.tradeRequestIO(3, 'Px', { O: 1 }, { W: 3 }, 0)
    game.tradeResponseIO(1, '0', false) // the id as the browser sends it: a string
    assert.deepEqual(game.ongoing_trades.map(t => t.status), ['deleted', 'deleted', 'deleted'])
  })

  await t.test('only answers an open request of the active player', () => {
    const game = withRequest()
    setHand(game.getPlayer(4), { B: 1 })
    game.tradeRequestIO(4, 'Px', { B: 1 }, { O: 1 }) // a proposal: not counterable
    game.tradeRequestIO(3, 'Px', { O: 1 }, { B: 1 }, 1)
    game.tradeRequestIO(3, 'Px', { O: 1 }, { W: 3 }, 9) // no such row
    assert.equal(game.ongoing_trades.length, 2)
    game.tradeResponseIO(1, 0, false) // withdrawn
    game.tradeRequestIO(3, 'Px', { O: 1 }, { W: 3 }, 0)
    assert.equal(game.ongoing_trades.length, 2, 'not once it is settled')
  })

  await t.test('does not count against the proposal limit', () => {
    const game = withRequest({ max_trade_requests: 1 })
    game.tradeRequestIO(3, 'Px', { O: 1 }, { B: 1 })
    game.tradeRequestIO(3, 'Px', { O: 1 }, { W: 3 }, 0)
    assert.equal(game.ongoing_trades.length, 3, 'the counter got through beside the open proposal')
    game.tradeRequestIO(3, 'Px', { O: 1 }, { S: 1 })
    assert.equal(game.ongoing_trades.length, 3, 'a second proposal did not')
  })

  await t.test('the active player is told there is something to answer', () => {
    const game = withRequest()
    const asked = []
    game.onAwaiting = a => asked.push(a)
    game.tradeRequestIO(3, 'Px', { O: 1 }, { W: 3 }, 0)
    assert.deepEqual(asked, [{ pid: 1, kind: 'TRADE_REQ', trade_id: 1 }])
  })
})
