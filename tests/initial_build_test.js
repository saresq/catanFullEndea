import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import Board from '../public/js/board/board.js'
import * as CONST from '../public/js/const.js'
import { until } from './helpers.js'

const fakeIo = { to: () => ({ emit: () => {} }) }

/** A hand-made map from the editor: playable, but far too small for a full table. */
const TINY_MAP = 'S.S.S-S.G6.J8.S-S.C5.D.F4.S+S.G10.J3.S+S.S.S'

function autoPlacedGame(mapkey, player_count) {
  const config = Object.assign({}, CONST.GAME_CONFIG, {
    mapkey, player_count, map_shuffle: 'none',
    // Everything auto-places immediately: nobody clicks a corner.
    timer: true, first_roll_time: 0, initial_build_time: 0,
  })
  const game = new Game({ id: 'test', io: fakeIo, host: { name: 'P1', id: 1 }, config, onGameEnd: () => {} })
  for (let i = 2; i <= player_count; i++) { game.join('P' + i) }
  game.start()
  return game
}

test('initial placement survives a map with no room left', async () => {
  // Ten players on a five-tile map: the board runs out of legal corners part way through.
  // It used to throw inside the turn timer, which takes the whole server process down with it.
  const game = autoPlacedGame(TINY_MAP, 10)
  await until(() => game.state === CONST.GAME_STATES.PLAYER_ROLL, 'the first roll')
  game.clearTimer()

  const placed = game.players.filter(p => p.pieces.S.length).length
  assert.ok(placed >= 1, 'at least one player got a settlement')
})

test('initial placement still works on the standard map', async () => {
  const game = autoPlacedGame(CONST.GAME_CONFIG.mapkey, 4)
  await until(() => game.state === CONST.GAME_STATES.PLAYER_ROLL, 'the first roll')
  game.clearTimer()

  game.players.forEach(p => {
    assert.equal(p.pieces.S.length, 2, `player ${p.id} placed both settlements`)
    assert.equal(p.pieces.R.length, 2, `player ${p.id} placed both roads`)
  })
})

test('maxPlayers refuses more players than a map can seat', () => {
  assert.equal(Board.maxPlayers(TINY_MAP), 3)
  // No preset may ever be blocked by the check.
  CONST.MAP_LIST.forEach(map => {
    assert.ok(Board.maxPlayers(map.mapkey) >= map.max_players,
      `${map.id} seats its ${map.max_players} players`)
  })
})
