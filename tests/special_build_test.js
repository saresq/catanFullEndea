// The special building phase (5+ players): after each turn every other seat gets one window, in
// seat order, to build and buy - no trades, no card plays - before the next player rolls.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { until } from './helpers.js'
import { setHand, spyIo } from './bot_helpers.js'

const ST = CONST.GAME_STATES
const SOC = CONST.SOCKET_EVENTS
const RICH = { L: 5, B: 5, W: 5, S: 5, O: 5 }

/** A game of `player_count` humans past initial placement, timer off, dice that never roll a 7. */
function newGame(player_count, events = []) {
  const game = new Game({
    id: 'special-build', io: spyIo(events).io, host: { id: 1, name: 'P1' },
    config: { player_count, timer: false }, onGameEnd: () => {},
  })
  for (let i = 2; i <= player_count; i++) { game.join('P' + i) }
  game.start()
  let guard = 0
  while (game.state === ST.INITIAL_SETUP && guard++ < 40) { game.initialBuildIO(game.active_pid) }
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  return game
}

/** Roll for the active seat, then set every hand: `hands(pid)` or empty. */
function rollAndDeal(game, hands = () => ({})) {
  game.playerRollIO(game.active_pid)
  assert.equal(game.state, ST.PLAYER_ACTIONS)
  game.players.forEach(p => setHand(p, hands(p.id)))
}

/** End the turn and pass every window; returns the builders in the order they got one. */
function passAll(game) {
  game.endTurnIO(game.active_pid)
  const order = []
  while (game.state === ST.SPECIAL_BUILD && order.length < 20) {
    order.push(game.builder_pid)
    game.endTurnIO(game.builder_pid)
  }
  return order
}

/** Play turns with empty hands (no windows) until `pid` is the active seat. */
function turnTo(game, pid) {
  let guard = 0
  while (game.active_pid !== pid && guard++ < 20) { rollAndDeal(game); passAll(game) }
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
  assert.ok(!events.some(([e, s]) => e === SOC.STATE_CHANGE && s === ST.SPECIAL_BUILD))
})

test('windows go clockwise from the next seat and wrap, the ending player left out', () => {
  const game = newGame(6)
  turnTo(game, 4)
  rollAndDeal(game, () => RICH)
  assert.deepEqual(passAll(game), [5, 6, 1, 2, 3])
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 5)
})

test('a quit seat gets no window', () => {
  const game = newGame(6)
  turnTo(game, 2)
  game.removePlayer(3)
  rollAndDeal(game, () => RICH)
  assert.deepEqual(passAll(game), [4, 5, 6, 1])
})

test('players who can afford nothing are skipped', () => {
  const game = newGame(6)
  game.dev_cards = []
  // 2: empty hand, 3: only a dev card and the deck is empty, 4: a road, 5: a city, 6: nothing
  rollAndDeal(game, pid => ({ 3: { W: 1, S: 1, O: 1 }, 4: { L: 1, B: 1 }, 5: { W: 2, O: 3 } })[pid] || {})
  assert.deepEqual(passAll(game), [4, 5])
})

test('a seat whose pieces are all built is skipped even with the cards', () => {
  const game = newGame(5)
  const p2 = game.getPlayer(2)
  p2.pieces = { R: Array(15).fill(0), S: Array(5).fill(0), C: Array(4).fill(0) }
  game.dev_cards = []
  rollAndDeal(game, () => RICH)
  assert.deepEqual(passAll(game), [3, 4, 5])
})

test('everyone skipped: the next roll starts with no window', () => {
  const events = []
  const game = newGame(6, events)
  rollAndDeal(game)
  events.length = 0
  game.endTurnIO(1)
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 2)
  assert.ok(!events.some(([e, s]) => e === SOC.STATE_CHANGE && s === ST.SPECIAL_BUILD))
})

test('each window is announced with the builder as the acting seat', () => {
  const events = []
  const game = newGame(5, events)
  rollAndDeal(game, pid => pid === 3 ? RICH : {})
  events.length = 0
  game.endTurnIO(1)
  assert.equal(game.builder_pid, 3)
  assert.deepEqual(events.find(([e]) => e === SOC.STATE_CHANGE), [SOC.STATE_CHANGE, ST.SPECIAL_BUILD, 3, game.turn])
  assert.equal(game.toJSON().builder_pid, 3)
  assert.equal(game.toJSON().active_pid, 1, 'still player 1\'s turn')
  game.endTurnIO(3)
  assert.equal(game.toJSON().builder_pid, null)
})

test('the builder builds and buys', () => {
  const game = newGame(5)
  rollAndDeal(game, pid => pid === 2 ? RICH : {})
  game.endTurnIO(1)
  assert.equal(game.builder_pid, 2)
  const p2 = game.getPlayer(2)
  const road = game.board.getRoadLocationsFromRoads(p2.pieces.R)[0]
  game.clickedLocationIO(2, CONST.LOCS.EDGE, road)
  assert.ok(p2.pieces.R.includes(road), 'road built')
  const city = p2.pieces.S[0]
  game.clickedLocationIO(2, CONST.LOCS.CORNER, city)
  assert.ok(p2.pieces.C.includes(city), 'city built')
  const cards = p2.dev_card_count
  game.buyDevCardIO(2)
  assert.equal(p2.dev_card_count, cards + 1, 'card bought')
  assert.equal(game.state, ST.SPECIAL_BUILD, 'the window stays open until a pass')
})

test('no trades and no card plays in a window', () => {
  const game = newGame(5)
  rollAndDeal(game, pid => pid === 2 ? { ...RICH, dK: 1, dR: 1, dY: 1, dM: 1 } : pid === 1 ? RICH : {})
  game.endTurnIO(1)
  const p2 = game.getPlayer(2)
  p2.can_play_dc = true // the phase alone has to refuse the plays
  const hand = () => JSON.stringify(p2.closed_cards)
  const before = hand()

  game.tradeRequestIO(2, '*4', { L: 4 }, { O: 1 })
  game.tradeRequestIO(2, 'Px', { L: 1 }, { O: 1 })
  assert.equal(game.ongoing_trades.length, 0, 'no request opened')
  game.ongoing_trades.push({ pid: 1, giving: { W: 1 }, asking: { L: 1 }, id: 0, rejected: [], status: 'open' })
  game.tradeResponseIO(2, 0, true)
  assert.equal(game.ongoing_trades[0].status, 'open', 'nothing accepted')

  const robber = game.board.robber_loc
  const tile = game.board.getRobbableTiles().find(t => t !== robber)
  game.knightMoveIO(2, tile)
  assert.equal(game.board.robber_loc, robber, 'robber did not move')
  game.roadBuildingIO(2)
  game.monopolyIO(2, 'O')
  game.yearOfPlentyIO(2, 'O', 'O')
  game.playerRollIO(2)
  assert.equal(hand(), before, 'hand untouched')
  assert.equal(game.state, ST.SPECIAL_BUILD)
  assert.equal(game.builder_pid, 2)
})

test('other seats are locked out of a window', () => {
  const game = newGame(5)
  rollAndDeal(game, () => RICH)
  game.endTurnIO(1)
  game.endTurnIO(2) // player 2 passes: player 3's window
  assert.equal(game.builder_pid, 3)
  ;[1, 2, 4].forEach(pid => {
    const p = game.getPlayer(pid)
    const road = game.board.getRoadLocationsFromRoads(p.pieces.R)[0]
    game.clickedLocationIO(pid, CONST.LOCS.EDGE, road)
    assert.ok(!p.pieces.R.includes(road), `seat ${pid} built nothing`)
    const cards = p.dev_card_count
    game.buyDevCardIO(pid)
    assert.equal(p.dev_card_count, cards, `seat ${pid} bought nothing`)
    game.endTurnIO(pid)
    assert.equal(game.builder_pid, 3, `seat ${pid} cannot close the window`)
  })
})

test('the window timer closes a window', async () => {
  const events = []
  const game = newGame(5, events)
  rollAndDeal(game, pid => [2, 3].includes(pid) ? RICH : {})
  Object.assign(game.config, { timer: true, special_build_time: 0.03 })
  events.length = 0
  game.endTurnIO(1)
  assert.equal(game.builder_pid, 2)
  assert.deepEqual(events.find(([e]) => e === SOC.SET_TIMER), [SOC.SET_TIMER, 0.03, 2], 'timer on the builder')
  await until(() => game.builder_pid === 3, 'the window to time out')
  await until(() => game.state === ST.PLAYER_ROLL, 'the last window to time out')
  assert.equal(game.active_pid, 2)
  game.clearTimer()
})

test('a builder who quits closes their window at once', () => {
  const game = newGame(5)
  rollAndDeal(game, () => RICH)
  game.endTurnIO(1)
  assert.equal(game.builder_pid, 2)
  game.removePlayer(2)
  assert.equal(game.builder_pid, 3)
  game.removePlayer(4) // queued, not building
  assert.equal(game.builder_pid, 3)
  game.endTurnIO(3)
  assert.equal(game.builder_pid, 5)
  game.endTurnIO(5)
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 3, 'seat 2 quit, so seat 3 is next')
})

test('the turn\'s owner quitting leaves the windows open', () => {
  const game = newGame(5)
  rollAndDeal(game, () => RICH)
  game.endTurnIO(1)
  game.removePlayer(1)
  assert.equal(game.builder_pid, 2)
  assert.deepEqual(passAll(game), [2, 3, 4, 5])
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 2)
})

test('a card bought in a window is playable on the next own turn', () => {
  const game = newGame(5)
  rollAndDeal(game, pid => pid === 2 ? { W: 1, S: 1, O: 1 } : {})
  game.dev_cards.push('dK')
  game.endTurnIO(1)
  assert.equal(game.builder_pid, 2)
  game.buyDevCardIO(2)
  const p2 = game.getPlayer(2)
  assert.equal(p2.closed_cards.dK, 1)
  game.endTurnIO(2)
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 2)
  const tile = game.board.getRobbableTiles().find(t => t !== game.board.robber_loc)
  game.knightMoveIO(2, tile)
  assert.equal(p2.open_dev_cards.dK, 1, 'knight played')
  assert.equal(game.board.robber_loc, tile)
})
