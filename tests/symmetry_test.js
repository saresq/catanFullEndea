import test from 'node:test'
import assert from 'node:assert/strict'
import Board from '../public/js/board/board.js'
import * as CONST from '../public/js/const.js'
import { fromCells, symmetrize, symmetryReport, toCells } from '../public/js/board/symmetry.js'
import { validateMapkey } from '../public/js/board/map_grid.js'

/** Land, numbers and ports of a map, as sorted lists: what symmetrizing must leave alone. */
function contents(mapkey) {
  const tiles = new Board(mapkey, [], true).tile_rows.flat()
  return {
    land: tiles.filter(t => t.type !== 'S').map(t => t.type + (t.num || '')).sort(),
    ports: tiles.filter(t => t.trade_edge).map(t => t.trade_type + t.trade_ratio).sort(),
    facing_sea: tiles.filter(t => t.trade_edge && (!t.adjacent_tiles[t.trade_edge] || t.adjacent_tiles[t.trade_edge].type === 'S')).length,
  }
}

const NEIGHBOURS = [[-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]

/** Separate islands of land in a mapkey. */
function islands(mapkey) {
  const land = new Set([...toCells(mapkey)].filter(([, t]) => t[0] !== 'S').map(([k]) => k))
  const seen = new Set()
  let n = 0
  for (const start of land) {
    if (seen.has(start)) { continue }
    n++
    const stack = [start]
    seen.add(start)
    while (stack.length) {
      const [x, y] = stack.pop().split(',').map(Number)
      NEIGHBOURS.map(([dx, dy]) => `${x + dx},${y + dy}`).filter(k => land.has(k) && !seen.has(k))
        .forEach(k => { seen.add(k); stack.push(k) })
    }
  }
  return n
}

test('cells round-trip through a mapkey', () => {
  const mapkey = CONST.MAPS.standard.mapkey
  const again = fromCells(toCells(mapkey))
  assert.deepEqual(contents(again), contents(mapkey))
  assert.deepEqual(symmetryReport(again), symmetryReport(mapkey))
})

test('the standard map is symmetric every way', () => {
  assert.deepEqual(symmetryReport(CONST.MAPS.standard.mapkey), { mirror_x: 0, mirror_y: 0, rotate: 0 })
})

Object.keys(CONST.MAPS).forEach(id => {
  ['mirror_x', 'mirror_y', 'rotate'].forEach(kind => {
    test(`${id}: ${kind} leaves the land, numbers and ports as they were`, () => {
      const mapkey = CONST.MAPS[id].mapkey
      const { mapkey: out } = symmetrize(mapkey, kind)
      assert.equal(validateMapkey(out), null)
      const before = contents(mapkey), after = contents(out)
      assert.deepEqual(after.land, before.land)
      assert.deepEqual(after.ports, before.ports)
      assert.equal(after.facing_sea, 0, 'every port faces land')
      assert.equal(symmetryReport(out)[kind], 0, `${kind} of ${id} is symmetric`)
      assert.equal(symmetrize(out, kind).moved, 0)
      // The number the editor shows is the number that moves
      assert.equal(symmetrize(mapkey, kind).moved, symmetryReport(mapkey)[kind])
      assert.ok(islands(out) <= islands(mapkey), 'no new islands')
    })
  })
})

test('an odd count turns half a turn round a tile, never round a corner', () => {
  // Three tiles in a triangle: the best centre by pairs is the corner they share, which cannot
  // hold three tiles. A half turn round one of them, moving one, can.
  const { mapkey, moved } = symmetrize('F5.G6\n+M8', 'rotate')
  assert.equal(moved, 1)
  assert.equal(symmetryReport(mapkey).rotate, 0)
  assert.deepEqual(contents(mapkey).land, ['F5', 'G6', 'M8'])
})

test('the large preset turns half a turn with every tile placed', () => {
  // 41 tiles: the old search took a centre on a corner and left one tile out of the pattern
  const mapkey = CONST.MAPS.large.mapkey
  const { mapkey: out, moved } = symmetrize(mapkey, 'rotate')
  assert.equal(symmetryReport(out).rotate, 0)
  assert.equal(moved, symmetryReport(mapkey).rotate)
})

test('a tile off the axis moves beside the other, not out to sea', () => {
  // Two tiles one above the other can only mirror left-right as a pair on one row; an axis
  // through one of them would send the other two rows away
  const { mapkey } = symmetrize('S.S.S\n-S.D.S\n+S.F5.S\n-S.S.S', 'mirror_x')
  assert.equal(symmetryReport(mapkey).mirror_x, 0)
  assert.equal(islands(mapkey), 1)
})

test('empty and single-tile maps are already symmetric', () => {
  for (const mapkey of ['S', 'S.S\n+S.S', 'F5', 'S.S.S\n+S.F5.S\n-S.S.S']) {
    assert.deepEqual(symmetryReport(mapkey), { mirror_x: 0, mirror_y: 0, rotate: 0 })
    assert.deepEqual(symmetrize(mapkey, 'rotate'), { mapkey, moved: 0 })
  }
})

test('random islands come out symmetric, whole, and with the same tiles', () => {
  let seed = 7
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647
  const kinds = ['F5', 'G6', 'M8', 'J9', 'C10', 'D']
  for (let i = 0; i < 150; i++) {
    const cells = new Map([['0,0', 'F5']])
    const size = 1 + Math.floor(random() * 25)
    while (cells.size < size) {
      const [x, y] = [...cells.keys()][Math.floor(random() * cells.size)].split(',').map(Number)
      const [dx, dy] = NEIGHBOURS[Math.floor(random() * 6)]
      cells.set(`${x + dx},${y + dy}`, kinds[Math.floor(random() * kinds.length)])
    }
    const mapkey = fromCells(cells)
    const report = symmetryReport(mapkey)
    ;['mirror_x', 'mirror_y', 'rotate'].forEach(kind => {
      const { mapkey: out, moved } = symmetrize(mapkey, kind)
      assert.equal(validateMapkey(out), null)
      assert.deepEqual(contents(out).land, contents(mapkey).land)
      assert.equal(symmetryReport(out)[kind], 0, `${kind} of\n${mapkey}`)
      assert.equal(moved, report[kind])
    })
  }
})
