// Leaving the waiting room frees the seat, so the same player can join again; a host who leaves
// hands the room over instead of closing it on everyone else.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'

const io = { to: () => ({ emit: () => {} }) }
function lobby(onGameEnd = () => {}) {
  return new Game({ id: 'lobby', io, host: { id: 1, name: 'Alice' }, config: { player_count: 3 }, onGameEnd })
}

test('a player who leaves the waiting room can join again', () => {
  const game = lobby()
  const bob = game.join('Bob')
  game.removePlayer(bob.id)
  assert.equal(game.hasPlayer(bob.id), false)
  const again = game.join('Bob')
  assert.ok(again)
  assert.equal(again.name, 'Bob')
})

test('the host leaving passes the room on and the host can come back', () => {
  let ended = 0
  const game = lobby(() => ended++)
  game.join('Bob')
  game.removePlayer(1)
  assert.equal(ended, 0)
  assert.equal(game.host_pid, 2)
  const alice = game.join('Alice')
  assert.ok(alice)
  assert.notEqual(alice.id, game.host_pid)
})

test('the lobby closes once the last player leaves', () => {
  let ended = 0
  const game = lobby(() => ended++)
  game.removePlayer(1)
  assert.equal(ended, 1)
})
