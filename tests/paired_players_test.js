// Paired players (5+ players): after the active player's action phase, one seat (the third to the
// left at 5 and 6, more at bigger tables) takes a full action phase of its own - build, buy, one
// development card, bank trades - before the next seat rolls. Player trades stay on the own turn.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { until, playToFirstRoll } from './helpers.js'
import { setHand, spyIo } from './bot_helpers.js'

const ST = CONST.GAME_STATES
const SOC = CONST.SOCKET_EVENTS
const RICH = { L: 5, B: 5, W: 5, S: 5, O: 5 }

/** A game of `player_count` humans past initial placement, timer off, dice that never roll a 7. */
function newGame(player_count, events = []) {
  const game = new Game({
    id: 'paired', io: spyIo(events).io, host: { id: 1, name: 'P1' },
    config: { player_count, timer: false }, onGameEnd: () => {},
  })
  for (let i = 2; i <= player_count; i++) { game.join('P' + i) }
  playToFirstRoll(game)
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  return game
}

/** Roll for the active seat, then set every hand: `hands(pid)` or empty. */
function rollAndDeal(game, hands = () => ({})) {
  game.playerRollIO(game.active_pid)
  assert.equal(game.state, ST.PLAYER_ACTIONS)
  game.players.forEach(p => setHand(p, hands(p.id)))
}

/** End the turn and every paired phase; returns the partners in the order they acted. */
function endAll(game) {
  game.endTurnIO(game.active_pid)
  const order = []
  while (game.state === ST.PAIRED_ACTIONS && order.length < 20) {
    order.push(game.partner_pid)
    game.endTurnIO(game.partner_pid)
  }
  return order
}

/** Play turns with empty hands (no paired phases) until `pid` is the active seat. */
function turnTo(game, pid) {
  let guard = 0
  while (game.active_pid !== pid && guard++ < 20) { rollAndDeal(game); endAll(game) }
  assert.equal(game.active_pid, pid)
}

test('no phase at four players', () => {
  const game = newGame(4)
  rollAndDeal(game, () => RICH)
  game.endTurnIO(1)
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 2)
})

test('not after initial placement', () => {
  const events = []
  const game = newGame(6, events)
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 1)
  assert.ok(!events.some(([e, s]) => e === SOC.STATE_CHANGE && s === ST.PAIRED_ACTIONS))
})

test('five and six players: the third seat to the left, wrapping around the table', () => {
  const five = newGame(5)
  rollAndDeal(five, () => RICH)
  assert.deepEqual(endAll(five), [4])
  assert.equal(five.active_pid, 2)

  const six = newGame(6)
  rollAndDeal(six, () => RICH)
  assert.deepEqual(endAll(six), [4])
  turnTo(six, 5)
  rollAndDeal(six, () => RICH)
  assert.deepEqual(endAll(six), [2], 'wraps')
  assert.equal(six.active_pid, 6)
})

test('a quit seat is skipped in the count', () => {
  const game = newGame(6)
  game.removePlayer(3)
  rollAndDeal(game, () => RICH)
  assert.deepEqual(endAll(game), [5], 'seats 2, 4, 5 are the first, second and third to the left')
})

test('eight players pair two seats, ten pair three, in order', () => {
  const eight = newGame(8)
  rollAndDeal(eight, () => RICH)
  assert.deepEqual(endAll(eight), [4, 6])
  assert.equal(eight.active_pid, 2)

  const ten = newGame(10)
  rollAndDeal(ten, () => RICH)
  assert.deepEqual(endAll(ten), [4, 6, 9])
  assert.equal(ten.active_pid, 2)
})

test('quits shrink the pairing: eight seats down to six pair one, fewer than five pair none', () => {
  const game = newGame(8)
  game.removePlayer(7); game.removePlayer(8)
  rollAndDeal(game, () => RICH)
  assert.deepEqual(endAll(game), [4], 'the third remaining seat to the left')
  ;[6, 5].forEach(pid => game.removePlayer(pid))
  turnTo(game, 1)
  rollAndDeal(game, () => RICH)
  assert.deepEqual(endAll(game), [])
  assert.equal(game.state, ST.PLAYER_ROLL)
})

test('the phase is announced with the partner as the acting seat', () => {
  const events = []
  const game = newGame(5, events)
  rollAndDeal(game, () => RICH)
  events.length = 0
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  assert.deepEqual(events.find(([e]) => e === SOC.STATE_CHANGE), [SOC.STATE_CHANGE, ST.PAIRED_ACTIONS, 4, game.turn])
  assert.equal(game.toJSON().partner_pid, 4)
  assert.equal(game.toJSON().active_pid, 1, 'still player 1\'s turn')
  game.endTurnIO(4)
  assert.equal(game.toJSON().partner_pid, null)
})

test('the partner builds, buys, trades with the bank and plays a knight', () => {
  const game = newGame(5)
  rollAndDeal(game, pid => pid === 4 ? { ...RICH, dK: 1 } : {})
  game.getPlayer(4).can_play_dc = false // a phase is a turn of its own for cards
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  const p4 = game.getPlayer(4)
  const road = game.board.getRoadLocationsFromRoads(p4.pieces.R, 4)[0]
  game.clickedLocationIO(4, CONST.LOCS.EDGE, road)
  assert.ok(p4.pieces.R.includes(road), 'road built')
  const city = p4.pieces.S[0]
  game.clickedLocationIO(4, CONST.LOCS.CORNER, city)
  assert.ok(p4.pieces.C.includes(city), 'city built')
  const cards = p4.dev_card_count
  game.buyDevCardIO(4)
  assert.equal(p4.dev_card_count, cards + 1, 'card bought')
  const ore = p4.closed_cards.O
  game.tradeRequestIO(4, '*4', { S: 4 }, { O: 1 })
  assert.equal(p4.closed_cards.O, ore + 1, 'bank trade')
  const robber = game.board.robber_loc
  const tile = game.board.getRobbableTiles().find(t => t !== robber)
  game.knightMoveIO(4, tile)
  assert.equal(game.board.robber_loc, tile, 'knight moved the robber')
  assert.equal(p4.open_dev_cards.dK, 1)
  assert.equal(game.state, ST.PAIRED_ACTIONS, 'the phase runs until ended')
})

test('no player trade request in the phase; the active player is locked out', () => {
  const game = newGame(5)
  rollAndDeal(game, () => RICH)
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  game.tradeRequestIO(4, 'Px', { L: 1 }, { O: 1 })
  assert.equal(game.ongoing_trades.length, 0, 'no request opened')

  const p1 = game.getPlayer(1)
  const road = game.board.getRoadLocationsFromRoads(p1.pieces.R, 1)[0]
  game.clickedLocationIO(1, CONST.LOCS.EDGE, road)
  assert.ok(!p1.pieces.R.includes(road), 'player 1 built nothing')
  const cards = p1.dev_card_count
  game.buyDevCardIO(1)
  assert.equal(p1.dev_card_count, cards, 'player 1 bought nothing')
  game.tradeRequestIO(1, '*4', { L: 4 }, { O: 1 })
  assert.equal(p1.closed_cards.O, RICH.O, 'player 1 did not trade')
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4, 'player 1 cannot end the phase')
  game.playerRollIO(4)
  assert.equal(game.state, ST.PAIRED_ACTIONS, 'the partner does not roll')
})

test('a separate turn for development cards', () => {
  const game = newGame(5)
  const p4 = game.getPlayer(4)
  // Bought on the own turn: playable in a later phase
  turnTo(game, 4)
  rollAndDeal(game, pid => pid === 4 ? { W: 1, S: 1, O: 1 } : {})
  game.dev_cards.push('dK')
  game.buyDevCardIO(4)
  assert.equal(p4.closed_cards.dK, 1)
  endAll(game)
  turnTo(game, 1)
  rollAndDeal(game, pid => pid === 4 ? { W: 1, S: 1, O: 1 } : {})
  p4.giveCards({ dM: 1 })
  game.dev_cards.push('dK')
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  // One card per phase
  const tile = game.board.getRobbableTiles().find(t => t !== game.board.robber_loc)
  game.knightMoveIO(4, tile)
  assert.equal(p4.open_dev_cards.dK, 1, 'knight played in the phase')
  assert.equal(p4.closed_cards.dK, 0)
  game.monopolyIO(4, 'O')
  assert.equal(p4.closed_cards.dM, 1, 'a second card stays in hand')
  // Bought in the phase: not playable now, playable on the next own turn
  game.buyDevCardIO(4)
  assert.equal(p4.closed_cards.dK, 1)
  p4.can_play_dc = true
  game.knightMoveIO(4, tile)
  assert.equal(p4.open_dev_cards.dK, 1, 'the card just bought stays in hand')
  game.endTurnIO(4)
  turnTo(game, 4)
  assert.ok(p4.can_play_dc, 'the phase did not use up the own turn\'s play')
  const tile2 = game.board.getRobbableTiles().find(t => t !== game.board.robber_loc)
  game.knightMoveIO(4, tile2)
  assert.equal(p4.open_dev_cards.dK, 2, 'playable on the own turn')
})

test('reaching the target in the phase ends the game at once', async () => {
  const game = newGame(5)
  rollAndDeal(game, pid => pid === 4 ? { W: 2, O: 3 } : {})
  const p4 = game.getPlayer(4)
  p4.public_vps = game.config.win_points - 1 - p4.private_vps
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  game.clickedLocationIO(4, CONST.LOCS.CORNER, p4.pieces.S[0])
  await until(() => game.end_context, 'the game to end')
  clearTimeout(game.end_cleanup_timer)
  assert.equal(game.end_context.pid, 4)
})

test('the timer ends the phase', async () => {
  const events = []
  const game = newGame(5, events)
  rollAndDeal(game, () => RICH)
  Object.assign(game.config, { timer: true, player_turn_time: 0.03 })
  events.length = 0
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  assert.deepEqual(events.find(([e]) => e === SOC.SET_TIMER), [SOC.SET_TIMER, 0.03, 4], 'timer on the partner')
  await until(() => game.state === ST.PLAYER_ROLL, 'the phase to time out')
  assert.equal(game.active_pid, 2)
  game.clearTimer()
})

test('an empty-handed partner is skipped', () => {
  const events = []
  const game = newGame(6, events)
  rollAndDeal(game, pid => pid === 4 ? { dVp: 1 } : {})
  events.length = 0
  game.endTurnIO(1)
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 2)
  assert.ok(!events.some(([e, s]) => e === SOC.STATE_CHANGE && s === ST.PAIRED_ACTIONS))
  // A playable card alone is enough
  rollAndDeal(game, pid => pid === 5 ? { dK: 1 } : {})
  game.endTurnIO(2)
  assert.equal(game.partner_pid, 5)
})

test('a partner who quits ends the phase; the active player quitting waits for it', () => {
  const game = newGame(8)
  rollAndDeal(game, () => RICH)
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  game.removePlayer(4)
  assert.equal(game.partner_pid, 6, 'on to the next partner')
  game.removePlayer(1)
  assert.equal(game.partner_pid, 6, 'the phase goes on')
  game.endTurnIO(6)
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 2)
})

test('the active player\'s open trade requests close when the phase starts', async () => {
  const game = newGame(5)
  rollAndDeal(game, () => RICH)
  game.tradeRequestIO(1, 'Px', { L: 1 }, { O: 1 })
  assert.equal(game.ongoing_trades.length, 1)
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  assert.equal(game.ongoing_trades.length, 0)
})

test('the active player quitting mid-turn pairs nobody for that turn; the next turn pairs as usual', () => {
  const game = newGame(6)
  rollAndDeal(game, () => RICH)
  game.removePlayer(1)
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 2, 'straight on to the next seat')
  rollAndDeal(game, () => RICH)
  assert.deepEqual(endAll(game), [5], 'the third seat to the left of player 2')
})

test('at eight seats a card bought in a phase stays held through the next phase, until the own turn', () => {
  // Seat 4 is paired after turns 7 (+5) and 1 (+3), both before its own turn
  const game = newGame(8)
  const p4 = game.getPlayer(4)
  turnTo(game, 7)
  rollAndDeal(game, pid => pid === 4 ? { W: 1, S: 1, O: 1 } : {})
  game.dev_cards.push('dK')
  game.endTurnIO(7)
  assert.equal(game.partner_pid, 4)
  game.buyDevCardIO(4)
  assert.equal(p4.closed_cards.dK, 1)
  game.endTurnIO(4)
  turnTo(game, 1)
  rollAndDeal(game, pid => pid === 4 ? { W: 1 } : {})
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4, 'player 4\'s second phase before their own turn')
  const tile = game.board.getRobbableTiles().find(t => t !== game.board.robber_loc)
  game.knightMoveIO(4, tile)
  assert.equal(p4.open_dev_cards.dK, 0, 'still held back')
  game.endTurnIO(4)
  turnTo(game, 4)
  game.knightMoveIO(4, tile)
  assert.equal(p4.open_dev_cards.dK, 1, 'playable on the own turn')
})

test('a partner whose only card is a Road Building it cannot place is skipped', () => {
  const game = newGame(5)
  const p4 = game.getPlayer(4)
  rollAndDeal(game, pid => pid === 4 ? { dR: 1 } : {})
  p4.pieces.R = Array(14).fill(p4.pieces.R[0]) // one road left in the box
  game.endTurnIO(1)
  assert.equal(game.state, ST.PLAYER_ROLL, 'skipped: the card cannot be played')
  assert.equal(game.active_pid, 2)
})
