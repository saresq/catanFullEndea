// The roll for first player: every seat rolls once, the highest plays first, ties re-roll among
// the tied, and placement, the snake back and the round count all start from that seat.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { until } from './helpers.js'
import { botLobby, playSetup } from './bot_helpers.js'

const ST = CONST.GAME_STATES
const SOC = CONST.SOCKET_EVENTS

function newGame(player_count, config = {}, events = []) {
  const io = { to: () => ({ emit: (...args) => events.push(args) }) }
  const game = new Game({
    id: 'first-roll', io, host: { id: 1, name: 'P1' },
    config: { player_count, timer: false, ...config }, onGameEnd: () => {},
  })
  for (let i = 2; i <= player_count; i++) { game.join('P' + i) }
  return game
}

/** Dice that hand out `totals` in order, whoever rolls. */
function scripted(game, totals) {
  const queue = totals.map(t => ({ d1: Math.ceil(t / 2), d2: Math.floor(t / 2) }))
  game.dice = { roll: () => queue.shift() || { d1: 1, d2: 1 } }
}

test('the highest total plays first; the phase is not a game roll', () => {
  const events = []
  const game = newGame(3, {}, events)
  game.start()
  assert.equal(game.state, ST.FIRST_ROLL)
  assert.deepEqual(game.first_roll_pending, [1, 2, 3])
  const asked = events.find(([e]) => e === SOC.FIRST_ROLL)
  assert.deepEqual(asked[1], { pending: [1, 2, 3], rolls: {}, reroll: false })
  game.getPlayer(2).giveCards({ L: 10 })
  scripted(game, [7, 9, 4])
  game.playerRollIO(1)
  assert.deepEqual(events.filter(([e]) => e === SOC.DICE_VALUE).at(-1), [SOC.DICE_VALUE, [4, 3], 1])
  assert.equal(game.state, ST.FIRST_ROLL, 'a 7 does nothing')
  assert.equal(game.getPlayer(2).resource_count, 10, 'nobody discards')
  game.playerRollIO(2)
  game.playerRollIO(1) // rolled already: ignored
  game.playerRollIO(3)
  assert.equal(game.state, ST.INITIAL_SETUP)
  assert.equal(game.first_pid, 2)
  assert.equal(game.active_pid, 2)
  assert.deepEqual(events.filter(([e]) => e === SOC.FIRST_ROLL).at(-1)[1], { first_pid: 2 })
})

test('a tie re-rolls only the tied seats', () => {
  const events = []
  const game = newGame(3, {}, events)
  game.start()
  scripted(game, [8, 5, 8, 6, 3])
  ;[1, 2, 3].forEach(pid => game.playerRollIO(pid))
  assert.equal(game.state, ST.FIRST_ROLL)
  assert.deepEqual(game.first_roll_pending, [1, 3])
  const again = events.filter(([e]) => e === SOC.FIRST_ROLL).at(-1)[1]
  assert.deepEqual(again, { pending: [1, 3], rolls: {}, reroll: true })
  game.playerRollIO(2)
  assert.deepEqual(game.first_roll_pending, [1, 3], 'seat 2 is not rolling')
  game.playerRollIO(1); game.playerRollIO(3)
  assert.equal(game.first_pid, 1)
  assert.equal(game.state, ST.INITIAL_SETUP)
})

test('the timer rolls for the idle and resolves, looping on ties', async () => {
  const game = newGame(3, { timer: true, first_roll_time: 0.02, initial_build_time: 60 })
  game.start()
  scripted(game, [6, 6, 6, 9, 4, 4])
  game.playerRollIO(2)
  await until(() => game.state === ST.INITIAL_SETUP, 'the timer to roll for everyone else')
  game.clearTimer()
  // The three-way tie re-rolled in the order the sixes landed: seat 2 first, so the 9 is theirs
  assert.equal(game.first_pid, 2)
})

test('a quit seat is rolled for and never wins', () => {
  const game = newGame(3)
  game.start()
  scripted(game, [12, 5, 6])
  game.removePlayer(1)
  assert.deepEqual(game.first_roll_pending, [2, 3])
  game.playerRollIO(2); game.playerRollIO(3)
  assert.equal(game.first_pid, 3)
  assert.equal(game.state, ST.INITIAL_SETUP)
})

test('every tied seat quitting during the re-roll hands the roll to whoever is left', () => {
  const game = newGame(5)
  game.start()
  // Seats 1 and 3 tie; each quit rolls for the quitter (6, 2), then seats 2, 4, 5 roll 2, 2, 9
  scripted(game, [8, 5, 8, 4, 3, 6, 2, 2, 2, 9])
  ;[1, 2, 3, 4, 5].forEach(pid => game.playerRollIO(pid))
  assert.deepEqual(game.first_roll_pending, [1, 3])
  game.removePlayer(1); game.removePlayer(3)
  assert.equal(game.state, ST.FIRST_ROLL)
  assert.deepEqual(game.first_roll_pending, [2, 4, 5], 'the remaining seats roll again')
  ;[2, 4, 5].forEach(pid => game.playerRollIO(pid))
  assert.equal(game.first_pid, 5)
  assert.equal(game.state, ST.INITIAL_SETUP)
})

test('bots roll on their own, re-rolls included', async () => {
  const { game } = botLobby({ humans: 1, bots: ['easy', 'medium', 'tryhard', 'medium'] })
  game.start()
  // Two five-way ties, then the first roller of the third round takes it with a 12
  scripted(game, [8, 8, 8, 8, 8, 3, 3, 3, 3, 3, 12, 2, 2, 2, 2])
  let human_rolls = 0
  await until(() => {
    if (game.state === ST.INITIAL_SETUP) return true
    // The human rolls last each round, once every bot has
    if (game.first_roll_pending.length === 1 && game.first_roll_pending[0] === 1) { human_rolls++; game.playerRollIO(1) }
  }, 'the bots to roll again until decided')
  assert.equal(human_rolls, 3, 'three rounds')
  assert.ok(game.first_pid >= 2 && game.first_pid <= 5, 'a bot rolled the 12')
})

test('seat 3 of 4 first: placement 3,4,1,2,2,1,4,3, seat 3 rolls first, rounds count from seat 3', () => {
  const game = newGame(4)
  game.start()
  scripted(game, [4, 5, 11, 6])
  ;[1, 2, 3, 4].forEach(pid => game.playerRollIO(pid))
  assert.equal(game.first_pid, 3)
  const order = []
  let guard = 0
  while (game.state === ST.INITIAL_SETUP && guard++ < 10) {
    order.push(game.active_pid)
    game.initialBuildIO(game.active_pid)
  }
  assert.deepEqual(order, [3, 4, 1, 2, 2, 1, 4, 3])
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 3)
  assert.equal(game.turn, 3)

  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  const playTurn = () => { game.playerRollIO(game.active_pid); game.endTurnIO(game.active_pid) }
  playTurn() // seat 3 -> 4
  assert.equal(game.turn, 3)
  playTurn() // seat 4 -> 1: no new round at seat 1
  assert.equal(game.active_pid, 1)
  assert.equal(game.turn, 3)
  playTurn() // 1 -> 2
  assert.equal(game.turn, 3)
  playTurn() // 2 -> 3: a new round
  assert.equal(game.active_pid, 3)
  assert.equal(game.turn, 4)
})

test('a card bought on a turn is still blocked that turn', () => {
  const game = newGame(4)
  game.start()
  scripted(game, [4, 5, 11, 6])
  ;[1, 2, 3, 4].forEach(pid => game.playerRollIO(pid))
  let guard = 0
  while (game.state === ST.INITIAL_SETUP && guard++ < 10) { game.initialBuildIO(game.active_pid) }
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  game.playerRollIO(3)
  const p3 = game.getPlayer(3)
  p3.giveCards({ W: 1, S: 1, O: 1 })
  game.dev_cards.push('dK')
  game.buyDevCardIO(3)
  assert.equal(p3.closed_cards.dK, 1)
  const tile = game.board.getRobbableTiles().find(t => t !== game.board.robber_loc)
  game.knightMoveIO(3, tile)
  assert.equal(p3.open_dev_cards.dK, 0, 'not this turn')
  game.endTurnIO(3)
  ;[4, 1, 2].forEach(pid => { game.playerRollIO(pid); game.endTurnIO(pid) })
  assert.equal(game.active_pid, 3)
  game.knightMoveIO(3, tile)
  assert.equal(p3.open_dev_cards.dK, 1, 'next own turn')
})

test('placing with bots starts from the winner', async () => {
  const { game } = botLobby({ humans: 1, bots: ['easy', 'easy'] })
  game.start()
  await playSetup(game)
  assert.equal(game.first_pid, 1)
  assert.equal(game.active_pid, 1)
  assert.equal(game.state, ST.PLAYER_ROLL)
})
