import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ENDEA_BLUE, EDGE_BLEND, computeField, depthAt, depthCurve, hexRgb, rampColor, sdHex, waterStops,
} from '../public/js/board/sea_depth.js'

const W = 149, H = 129

test('sdHex is negative inside, zero on an edge, positive outside', () => {
  assert.ok(sdHex(0, 0, W / 2) < 0)
  assert.ok(Math.abs(sdHex(W / 2, 0, W / 2)) < 1e-9)
  assert.ok(Math.abs(sdHex(W / 2 + 10, 0, W / 2) - 10) < 1e-9)
})

test('depthCurve starts at the coast and eases towards open ocean', () => {
  assert.equal(depthCurve(0), 0)
  assert.equal(depthCurve(-1), 0)
  let prev = 0
  for (let d = .1; d < 8; d += .1) {
    const v = depthCurve(d)
    assert.ok(v > prev && v < 1)
    prev = v
  }
  assert.ok(Math.abs(depthCurve(2) - .65) < .03)
  assert.ok(Math.abs(depthCurve(3.5) - .9) < .02)
})

test('depthAt reaches open ocean exactly at the drawn edge', () => {
  assert.equal(depthAt(1, 0), 1)
  assert.equal(depthAt(1, EDGE_BLEND + 1), depthCurve(1))
})

test('the palette ends at the open-ocean colour, and god mode is darker at every stop', () => {
  const stops = waterStops()
  assert.deepEqual(stops.at(-1), hexRgb(ENDEA_BLUE.at(-1)))
  assert.deepEqual(rampColor(stops, 1), stops.at(-1))
  const dark = waterStops({ h4x: true })
  dark.forEach((c, i) => c.forEach((v, j) => assert.ok(v < stops[i][j])))
})

test('distance field: land, a lake inside an island, an islet, open sea', async () => {
  // A ring of six land hexes around a one-hex lake at the origin, and a single islet far away
  const ring = [[W, 0], [-W, 0], [W / 2, H], [-W / 2, H], [W / 2, -H], [-W / 2, -H]]
  const land = [...ring.map(([x, y]) => ({ x, y })), { x: 12 * W, y: 0 }]
  const cell = 6, minX = -6 * W, minY = -6 * W
  const cols = Math.ceil(24 * W / cell), rows = Math.ceil(12 * W / cell)
  const field = await computeField({ land, W, minX, minY, cols, rows, cell })
  const at = (x, y) => field[Math.floor((y - minY) / cell) * cols + Math.floor((x - minX) / cell)]

  assert.ok(at(W, 0) < 0, 'land is negative')
  assert.ok(at(0, 0) > 0, 'the lake is water')
  assert.ok(at(12 * W, 0) < 0, 'the islet is land')
  assert.ok(at(12 * W + W, 0) > 0 && at(12 * W + W, 0) < 1, 'the islet has its own shallows')
  const open = at(6 * W, 3 * W)
  assert.ok(at(0, 0) < open, 'the lake is shallower than open sea')
  assert.ok(open > 2)
})

test('computeField can be cancelled between slices', async () => {
  const field = await computeField(
    { land: [{ x: 0, y: 0 }], W, minX: -3000, minY: -3000, cols: 1000, rows: 1000, cell: 6 },
    { sliceMs: 0, isCancelled: () => true })
  assert.equal(field, null)
})
