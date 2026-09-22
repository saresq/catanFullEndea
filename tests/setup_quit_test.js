// A quit during initial placement used to end the game for everyone. Now the quit seat is placed
// at random and the others play on; the one-left / nobody-left rules still hold.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { until } from './helpers.js'

const ST = CONST.GAME_STATES
const io = { to: () => ({ emit: () => {} }) }

function setupGame(player_count, onGameEnd = () => {}) {
  const game = new Game({ id: 'setup-quit', io, host: { id: 1, name: 'P1' }, config: { player_count, timer: false }, onGameEnd })
  for (let i = 2; i <= player_count; i++) { game.join('P' + i) }
  game.start()
  return game
}
function finishSetup(game) {
  let guard = 0
  while (game.state === ST.INITIAL_SETUP && guard++ < 40) { game.initialBuildIO(game.active_pid) }
}

test('a quit in the first placement round leaves the others playing to the first roll', () => {
  let ended = 0
  const game = setupGame(4, () => ended++)
  game.initialBuildIO(1)
  assert.equal(game.active_pid, 2)
  game.removePlayer(2) // the expected seat quits
  assert.equal(ended, 0)
  assert.equal(game.state, ST.INITIAL_SETUP)
  assert.equal(game.active_pid, 3, 'placed for the quitter and moved on')
  finishSetup(game)
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.equal(game.active_pid, 1)
  game.players.forEach(p => {
    assert.equal(p.pieces.S.length, 2, `seat ${p.id} has both settlements`)
    assert.equal(p.pieces.R.length, 2, `seat ${p.id} has both roads`)
  })
})

test('a seat that quits while others are placing still gets its pieces', () => {
  const game = setupGame(3)
  game.removePlayer(3) // not its turn yet
  assert.equal(game.state, ST.INITIAL_SETUP)
  finishSetup(game)
  assert.equal(game.state, ST.PLAYER_ROLL)
  assert.deepEqual(game.players.map(p => p.pieces.S.length), [2, 2, 2])
  assert.equal(game.getPlayer(3).removed, true)
  // And the quit seat is skipped in the turn order
  game.playerRollIO(1); game.state === ST.PLAYER_ACTIONS && game.endTurnIO(1)
  if (game.state === ST.PLAYER_ROLL) {
    game.playerRollIO(2); game.state === ST.PLAYER_ACTIONS && game.endTurnIO(2)
    if (game.state === ST.PLAYER_ROLL) assert.equal(game.active_pid, 1, 'seat 3 skipped')
  }
  game.clearTimer()
})

test('all but one quitting during placement ends the game with a winner', async () => {
  const game = setupGame(3)
  game.removePlayer(2)
  game.removePlayer(3)
  await until(() => game.state === ST.END, 'the game to end')
  assert.equal(game.end_context.pid, 1)
  clearTimeout(game.end_cleanup_timer)
})

test('everyone quitting during placement closes the game', async () => {
  let ended = 0
  const game = setupGame(2, () => ended++)
  game.removePlayer(1) // one left: a deferred win for seat 2
  assert.equal(ended, 0)
  assert.equal(game.state, ST.INITIAL_SETUP)
  game.removePlayer(2)
  assert.equal(ended, 1)
  await until(() => game.end_context, 'the deferred end')
  clearTimeout(game.end_cleanup_timer)
})
