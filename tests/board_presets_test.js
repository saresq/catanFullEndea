// The tier presets carry the 5-6 Player Expansion's composition and its escalation, and every
// preset shuffles no matter what the do-not-shuffle options say.
import test from 'node:test'
import assert from 'node:assert/strict'
import Board from '../public/js/board/board.js'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'

/** Land, disc and port counts of a mapkey, and whether every port's trade edge faces land. */
function composition(mapkey) {
  const board = new Board(mapkey)
  const land = {}, discs = {}, ports = {}
  let facing_sea = 0
  board.tile_rows.flat().forEach(tile => {
    if (tile.type === 'S') {
      if (!tile.trade_edge) return
      const port = tile.trade_type + tile.trade_ratio
      ports[port] = (ports[port] || 0) + 1
      const faced = tile.adjacent_tiles[tile.trade_edge]
      if (!faced || faced.type === 'S') facing_sea++
      return
    }
    land[tile.type] = (land[tile.type] || 0) + 1
    if (tile.num) discs[tile.num] = (discs[tile.num] || 0) + 1
  })
  return { land, discs, ports, facing_sea, robber_on_desert: board.getRobbedTile()?.type === 'D' }
}

const total = obj => Object.values(obj).reduce((m, v) => m + v, 0)
const discsOf = (twos, each) => ({ 2: twos, 12: twos, ...Object.fromEntries([3, 4, 5, 6, 8, 9, 10, 11].map(n => [n, each])) })
const portsOf = generic => ({ '*3': generic, S2: 1, L2: 1, B2: 1, O2: 1, W2: 1 })

const TIERS = [
  { id: 'extended', players: 6, land: { C: 5, J: 6, G: 6, M: 5, F: 6, D: 2 }, hexes: 30, discs: discsOf(2, 3), ports: portsOf(6) },
  { id: 'large', players: 8, land: { C: 7, J: 8, G: 8, M: 7, F: 8, D: 3 }, hexes: 41, discs: discsOf(3, 4), ports: portsOf(8) },
  { id: 'xlarge', players: 10, land: { C: 9, J: 10, G: 10, M: 9, F: 10, D: 4 }, hexes: 52, discs: discsOf(4, 5), ports: portsOf(10) },
]

TIERS.forEach(({ id, players, land, hexes, discs, ports }) => {
  test(`the ${id} preset has the expansion's composition for ${players} players`, () => {
    const map = CONST.MAPS[id]
    assert.equal(map.max_players, players)
    const c = composition(map.mapkey)
    assert.deepEqual(c.land, land)
    assert.equal(total(c.land), hexes)
    assert.deepEqual(c.discs, discs)
    assert.equal(total(c.discs), hexes - land.D)
    assert.deepEqual(c.ports, ports)
    assert.equal(c.facing_sea, 0, 'every port faces land')
    assert.ok(c.robber_on_desert)
    assert.ok(Board.maxPlayers(map.mapkey) >= players, `seats ${players}`)
  })
})

test('the 5-6 preset is laid out in rows of 3-4-5-6-5-4-3 inside a sea frame', () => {
  const rows = new Board(CONST.MAPS.extended.mapkey).tile_rows.map(row => row.filter(t => t.type !== 'S').length)
  assert.deepEqual(rows, [0, 3, 4, 5, 6, 5, 4, 3, 0])
})

test('presets always shuffle everything; a hand-made map keeps the editor\'s options', () => {
  const keep = { map_shuffle: 'none', do_not_shuffle_resources: true, do_not_shuffle_numbers: true }
  CONST.MAP_LIST.forEach(map => assert.equal(CONST.shuffleTypeFor({ mapkey: map.mapkey, ...keep }), 'all', map.id))
  const custom = 'S.S.S.S-S.F6.G8.S+S.C5.M2.J11.S-S.F3.G12.S+S.S.S.S'
  assert.equal(CONST.shuffleTypeFor({ mapkey: custom, ...keep }), 'none')
  assert.equal(CONST.shuffleTypeFor({ mapkey: custom, map_shuffle: 'all', do_not_shuffle_numbers: true }), 'tile-port')
  assert.equal(CONST.shuffleTypeFor({ mapkey: custom, map_shuffle: 'all' }), 'tile-number-port')
})

test('a map picked in the lobby brings its shuffle rule; the board shuffles once, at start', () => {
  const io = { to: () => ({ emit: () => {} }) }
  const custom = 'S.S.S.S-S.F6.G8.S+S.C5.M2.J11.S-S.F3.G12.S+S.S.S.S'
  const game = new Game({
    id: 'shuffle', io, host: { id: 1, name: 'P1' }, onGameEnd: () => {},
    config: { player_count: 2, timer: false, mapkey: CONST.MAPS.standard.mapkey, map_shuffle: 'all', do_not_shuffle_numbers: true },
  })
  game.join('P2')
  game.waitingRoomChangeConfigIO(1, { mapkey: custom, map_size: 'custom' })
  assert.equal(game.config.map_shuffle, 'tile-port', 'the editor\'s keep-numbers option applies to the hand-made map')
  game.waitingRoomChangeConfigIO(1, { mapkey: CONST.MAPS.extended.mapkey, map_size: 'extended' })
  assert.equal(game.config.map_shuffle, 'all', 'a preset ignores it')
  const before = game.config.mapkey
  game.start()
  assert.notEqual(game.config.mapkey, before, 'shuffled at start')
  assert.equal(new Board(game.config.mapkey).tile_rows.flat().filter(t => t.type !== 'S').length, 30)
  game.clearTimer()
})

test('a lobby map too small for the seats gives way to the smallest preset that seats them', () => {
  const io = { to: () => ({ emit: () => {} }) }
  const game = new Game({
    id: 'fit', io, host: { id: 1, name: 'P1' }, onGameEnd: () => {},
    config: { player_count: 4, timer: false, mapkey: CONST.MAPS.standard.mapkey },
  })
  game.waitingRoomChangeConfigIO(1, { player_count: 10 })
  assert.equal(game.config.mapkey, CONST.MAPS.xlarge.mapkey, 'more seats: a bigger preset')
  assert.equal(game.config.map_size, 'xlarge')
  game.waitingRoomChangeConfigIO(1, { mapkey: CONST.MAPS.standard.mapkey, map_size: 'standard' })
  assert.equal(game.config.mapkey, CONST.MAPS.xlarge.mapkey, 'a preset too small is refused')
  game.waitingRoomChangeConfigIO(1, { mapkey: CONST.MAPS.argentum.mapkey, map_size: 'argentum' })
  assert.equal(game.config.mapkey, CONST.MAPS.argentum.mapkey, 'another preset that fits is kept')
  const custom = 'S.S.S.S-S.F6.G8.S+S.C5.M2.J11.S-S.F3.G12.S+S.S.S.S'
  game.waitingRoomChangeConfigIO(1, { mapkey: custom, map_size: 'custom' })
  assert.equal(game.config.mapkey, CONST.MAPS.xlarge.mapkey, 'a hand-made map without the corners is refused')
  game.waitingRoomChangeConfigIO(1, { player_count: 2, mapkey: custom, map_size: 'custom' })
  assert.equal(game.config.mapkey, custom, 'and kept once it seats everyone')
})
