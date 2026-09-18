// Two ways a game used to never end cleanly: nobody connected but the turn timer still re-arming
// itself forever, and two players crossing win_points in the same tick.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'

const ST = CONST.GAME_STATES
const SOC = CONST.SOCKET_EVENTS
const tick = ms => new Promise(r => setTimeout(r, ms))

/** Records every emitted event name so the end-of-game broadcast can be counted. */
function spyIo(events = []) {
  return { io: { to: () => ({ emit: ev => events.push(ev) }) }, events }
}

/** A game that races through its turns, so a few rounds pass in milliseconds. */
function fastGame({ onGameEnd = () => {}, io }) {
  const config = {
    player_count: 3, timer: true,
    strategize_time: 0, initial_build_time: 0, roll_time: 0, player_turn_time: 0,
  }
  const game = new Game({ id: 'lifecycle', io, host: { id: 1, name: 'Alice' }, config, onGameEnd })
  game.join('Bob'); game.join('Cleo')
  game.start()
  return game
}

test('a game nobody is connected to ends itself', async () => {
  let ended = 0
  const game = fastGame({ io: spyIo().io, onGameEnd: () => ended++ })

  await tick(100)
  game.clearTimer()
  assert.ok(ended >= 1, 'the abandoned game reaped itself')
})

test('a game with a live socket keeps playing', async () => {
  let ended = 0
  const game = fastGame({ io: spyIo().io, onGameEnd: () => ended++ })
  game.getPlayer(1).setSocket({ id: 'sock-1' })

  await tick(100)
  game.clearTimer()
  assert.equal(ended, 0, 'somebody is watching, so it was left alone')
  assert.ok(game.turn > 3, 'and it really did keep taking turns')
})

test('two players crossing win_points in one tick announce one winner', async () => {
  const { io, events } = spyIo()
  const game = new Game({
    id: 'one-winner', io, host: { id: 1, name: 'Alice' },
    config: { player_count: 3, timer: false }, onGameEnd: () => {},
  })
  game.join('Bob'); game.join('Cleo')
  game.start()
  let guard = 0
  while (game.state === ST.INITIAL_SETUP && guard++ < 20) { game.initialBuildIO(game.active_pid) }

  // Same tick, two different players over the line - what a settlement that breaks an opponent's
  // Longest Road does: the road trophy moves before the builder's own piece is added.
  game.getPlayer(2).changeVp(game.config.win_points)
  game.getPlayer(3).changeVp(game.config.win_points)

  await tick(250)
  assert.equal(events.filter(e => e === SOC.GAME_END).length, 1, 'one end broadcast')
  assert.equal(game.end_context.pid, 2, 'first past the post won')
  clearTimeout(game.end_cleanup_timer)
})
