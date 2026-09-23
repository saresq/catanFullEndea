// Two ways a game used to never end cleanly: nobody connected but the turn timer still re-arming
// itself forever, and two players crossing win_points in the same tick.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { until, tick } from './helpers.js'

const ST = CONST.GAME_STATES
const SOC = CONST.SOCKET_EVENTS

/** Records every emitted event name so the end-of-game broadcast can be counted. */
function spyIo(events = []) {
  return { io: { to: () => ({ emit: ev => events.push(ev) }) }, events }
}

/** A game that races through its turns, so a few rounds pass in milliseconds. */
function fastGame({ onGameEnd = () => {}, io }) {
  const config = {
    player_count: 3, timer: true,
    strategize_time: 0, initial_build_time: 0, roll_time: 0, player_turn_time: 0,
    // A rolled 7 parks the game in the robber phase on its own 30s timer, which stalls the turn
    // counter for longer than any test should wait. Zero them too, so turns really do fly.
    robber_drop_time: 0, robber_move_time: 0,
  }
  const game = new Game({ id: 'lifecycle', io, host: { id: 1, name: 'Alice' }, config, onGameEnd })
  game.join('Bob'); game.join('Cleo')
  game.start()
  return game
}

test('a game nobody is connected to ends itself', async () => {
  let ended = 0
  const game = fastGame({ io: spyIo().io, onGameEnd: () => ended++ })

  await until(() => ended, 'the abandoned game to reap itself')
  game.clearTimer()
})

test('a game with a live socket keeps playing', async () => {
  let ended = 0
  const game = fastGame({ io: spyIo().io, onGameEnd: () => ended++ })
  game.getPlayer(1).setSocket({ id: 'sock-1' })

  // Past the three idle rounds that would reap it, so the reaper had every chance to fire.
  await until(() => game.turn > 6, 'the game to keep taking turns')
  game.clearTimer()
  assert.equal(ended, 0, 'somebody is watching, so it was left alone')
})

test('crossing win_points twice in one tick announces one winner', async () => {
  const { io, events } = spyIo()
  const game = new Game({
    id: 'one-winner', io, host: { id: 1, name: 'Alice' },
    config: { player_count: 3, timer: false }, onGameEnd: () => {},
  })
  game.join('Bob'); game.join('Cleo')
  game.start()
  let guard = 0
  while (game.state === ST.INITIAL_SETUP && guard++ < 20) { game.initialBuildIO(game.active_pid) }

  // Same tick, over the line twice - a road that takes Longest Road, then the settlement it opens.
  // Only the turn's owner can win, so it is the same player both times.
  const active = game.getActivePlayer()
  active.changeVp(game.config.win_points)
  active.changeVp(1)

  await until(() => game.end_context, 'the game to end') // deferred by 200ms
  // A second winner would have been scheduled in the same tick, so it would land right behind
  // this one. Give it room to show up before claiming it never did.
  await tick(50)
  assert.equal(events.filter(e => e === SOC.GAME_END).length, 1, 'one end broadcast')
  assert.equal(game.end_context.pid, active.id)
  clearTimeout(game.end_cleanup_timer)
})
