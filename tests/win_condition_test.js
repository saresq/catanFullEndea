// A player wins only while acting: on their own turn, or in their paired action phase. Points
// reached any other time are checked again when their turn starts. The one exception is the last
// player standing.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { until, tick, playToFirstRoll } from './helpers.js'
import { setHand } from './bot_helpers.js'

const ST = CONST.GAME_STATES
const io = { to: () => ({ emit: () => {} }) }

function newGame(player_count) {
  const game = new Game({
    id: 'win', io, host: { id: 1, name: 'P1' },
    config: { player_count, timer: false }, onGameEnd: () => {},
  })
  for (let i = 2; i <= player_count; i++) { game.join('P' + i) }
  playToFirstRoll(game)
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  return game
}

/** The active seat rolls and ends its turn, every hand emptied so no paired phase opens. */
function playTurn(game) {
  game.playerRollIO(game.active_pid)
  game.players.forEach(p => setHand(p, {}))
  game.endTurnIO(game.active_pid)
}

/** Put `player` `short` points below the target. */
const upTo = (game, player, short) => { player.public_vps = game.config.win_points - short - player.private_vps }

/** No end is scheduled: the 200ms defer had its chance. */
async function stillPlaying(game) {
  await tick(250)
  assert.equal(game.ending, false)
  assert.notEqual(game.state, ST.END)
}

async function winner(game) {
  await until(() => game.end_context, 'the game to end')
  clearTimeout(game.end_cleanup_timer)
  return game.end_context.pid
}

test('an off-turn Longest Road swing does not end the game; the turn start does', async () => {
  const game = newGame(4)
  const p3 = game.getPlayer(3)
  upTo(game, p3, 2)
  p3.toggleLongestRoad(true) // during player 1's turn
  await stillPlaying(game)
  playTurn(game) // player 2's turn starts: not theirs
  await stillPlaying(game)
  playTurn(game) // player 3's turn starts
  assert.equal(await winner(game), 3)
  assert.equal(game.state, ST.END)
})

test('points lost before the turn starts do not win', async () => {
  const game = newGame(4)
  const p3 = game.getPlayer(3)
  upTo(game, p3, 2)
  p3.toggleLongestRoad(true)
  playTurn(game)
  p3.toggleLongestRoad(false) // broken during player 2's turn
  playTurn(game)
  await stillPlaying(game)
  assert.equal(game.active_pid, 3)
})

test('another player reaching the target on their own turn wins first', async () => {
  const game = newGame(4)
  const p3 = game.getPlayer(3)
  upTo(game, p3, 2)
  p3.toggleLongestRoad(true) // off-turn, during player 1's
  playTurn(game)
  assert.equal(game.active_pid, 2)
  const p2 = game.getPlayer(2)
  upTo(game, p2, 1)
  p2.changeVp(1) // player 2, on their own turn
  assert.equal(await winner(game), 2)
})

test('hidden victory point cards count at the turn start', async () => {
  const game = newGame(4)
  const p2 = game.getPlayer(2)
  p2.changeVp(0, 1) // a VP card, bought off-turn
  upTo(game, p2, 0)
  await stillPlaying(game)
  playTurn(game)
  assert.equal(await winner(game), 2)
  assert.equal(game.end_context.dVp, 1)
})

test('reaching the target in a paired action phase wins at once', async () => {
  const game = newGame(5)
  game.playerRollIO(1)
  game.players.forEach(p => setHand(p, p.id === 4 ? { W: 2, O: 3 } : {}))
  const p4 = game.getPlayer(4)
  upTo(game, p4, 1)
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  game.clickedLocationIO(4, CONST.LOCS.CORNER, p4.pieces.S[0]) // a city: at the target
  assert.equal(await winner(game), 4)
  assert.equal(game.end_context.C, 1)
})

test('an award passed to a third seat during a paired phase waits for that seat', async () => {
  const game = newGame(5)
  game.playerRollIO(1)
  game.players.forEach(p => setHand(p, p.id === 4 ? { L: 1, B: 1 } : {}))
  game.endTurnIO(1)
  assert.equal(game.partner_pid, 4)
  const p2 = game.getPlayer(2)
  upTo(game, p2, 2)
  p2.toggleLongestRoad(true) // an award swing during player 4's phase
  await stillPlaying(game)
  game.endTurnIO(4)
  assert.equal(game.active_pid, 2, 'player 2\'s turn starts')
  assert.equal(await winner(game), 2)
})

test('the last player standing still wins at once', async () => {
  const game = newGame(3)
  playTurn(game)
  assert.equal(game.active_pid, 2)
  game.removePlayer(3)
  game.removePlayer(2)
  assert.equal(await winner(game), 1)
})
