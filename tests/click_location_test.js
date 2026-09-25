// A client-supplied location id must never reach a bare property access: socket.io dispatches
// listeners from a `process.nextTick`, so a throw here has no catchable call stack and exits.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { rollOff } from './helpers.js'

const ST = CONST.GAME_STATES
const fakeIo = { to: () => ({ emit: () => {} }) }

/** A 3-player game sitting in PLAYER_ACTIONS. */
function playingGame() {
  const game = new Game({
    id: 'click-loc', io: fakeIo,
    host: { id: 1, name: 'Alice' },
    config: { player_count: 3, timer: false },
    onGameEnd: () => {},
  })
  game.join('Bob'); game.join('Cleo')
  game.start()
  rollOff(game)
  let guard = 0
  while (game.state === ST.INITIAL_SETUP && guard++ < 20) { game.initialBuildIO(game.active_pid) }
  game.dice = { roll: () => ({ d1: 3, d2: 3 }) }
  game.playerRollIO()
  assert.equal(game.state, ST.PLAYER_ACTIONS)
  return game
}

test('a corner id the board does not have is ignored, not thrown on', () => {
  const game = playingGame()
  const player = game.getActivePlayer()
  const before = player.pieces.S.length

  ;[9999, -1, null, undefined, 'a', {}].forEach(id => {
    game.clickedLocationIO(player.id, CONST.LOCS.CORNER, id)
  })
  assert.equal(player.pieces.S.length, before, 'nothing was built')
})

test('a bad edge id is ignored too', () => {
  const game = playingGame()
  const player = game.getActivePlayer()
  const before = player.pieces.R.length

  ;[9999, -1, null].forEach(id => game.clickedLocationIO(player.id, CONST.LOCS.EDGE, id))
  assert.equal(player.pieces.R.length, before)
})

test('a legal corner still builds', () => {
  const game = playingGame()
  const player = game.getActivePlayer()
  player.giveCards({ L: 12, B: 12, W: 5, S: 5 })
  // Straight after setup both road ends sit next to the player's own settlement, so the distance
  // rule leaves no legal corner. Extend outward until one opens up. The setup is random, so how
  // many roads that takes varies; corner id 0 is a valid find.
  let loc
  for (let i = 0; i < 10 && loc === undefined; i++) {
    loc = game.board.getSettlementLocationsFromRoads(player.pieces.R)[0]
    if (loc === undefined) {
      const edge = game.board.getRoadLocationsFromRoads(player.pieces.R, player.id)[0]
      game.clickedLocationIO(player.id, CONST.LOCS.EDGE, edge)
    }
  }
  assert.ok(loc !== undefined, 'found a legal corner to test with')
  const before = player.pieces.S.length

  game.clickedLocationIO(player.id, CONST.LOCS.CORNER, loc)
  assert.equal(player.pieces.S.length, before + 1)
})
