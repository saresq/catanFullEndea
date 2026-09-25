import test from 'node:test'
import assert from 'node:assert/strict'
import Board from '../public/js/board/board.js'
import * as CONST from '../public/js/const.js'
import { applyShape, tidyShapes } from '../public/js/board/shapes.js'
import { symmetryReport } from '../public/js/board/symmetry.js'
import { validateMapkey } from '../public/js/board/map_grid.js'

/** Land tokens and port offers of a map, sorted, and how many ports face open sea. */
function contents(mapkey) {
  const tiles = new Board(mapkey, [], true).tile_rows.flat()
  return {
    land: tiles.filter(t => t.type !== 'S').map(t => t.type + (t.num || '')).sort(),
    ports: tiles.filter(t => t.trade_edge).map(t => t.trade_type + t.trade_ratio).sort(),
    facing_sea: tiles.filter(t => t.trade_edge && (!t.adjacent_tiles[t.trade_edge] || t.adjacent_tiles[t.trade_edge].type === 'S')).length,
  }
}

const minus = (list, drop) => {
  const out = [...list]
  drop.forEach(token => out.splice(out.indexOf(token), 1))
  return out
}

Object.keys(CONST.MAPS).forEach(id => {
  test(`${id}: every tidy shape is symmetric both ways and keeps the tiles it does not say it changes`, () => {
    const mapkey = CONST.MAPS[id].mapkey
    const before = contents(mapkey)
    const shapes = tidyShapes(mapkey)
    assert.ok(shapes.some(s => s.delta === 0), 'offers a shape with the same tile count')
    shapes.forEach(({ shape, delta }) => {
      const { mapkey: out, added, removed } = applyShape(mapkey, shape)
      assert.equal(validateMapkey(out), null)
      const report = symmetryReport(out)
      assert.equal(report.mirror_x, 0, 'left-right')
      assert.equal(report.mirror_y, 0, 'top-bottom')
      assert.equal(added.length - removed.length, delta)
      const after = contents(out)
      assert.deepEqual(after.land, [...minus(before.land, removed), ...added].sort())
      assert.deepEqual(after.ports, before.ports)
      assert.equal(after.facing_sea, 0, 'every port faces land')
    })
  })
})

test('a map that is already the tidy shape is offered itself', () => {
  const { shape } = tidyShapes(CONST.MAPS.standard.mapkey).find(s => s.delta === 0)
  assert.equal(contents(applyShape(CONST.MAPS.standard.mapkey, shape).mapkey).land.length, 19)
})
