import test from 'node:test'
import assert from 'node:assert/strict'
import Board from '../public/js/board/board.js'
import * as CONST from '../public/js/const.js'
import { balancePorts } from '../public/js/board/ports.js'
import { fromCells, toCells } from '../public/js/board/symmetry.js'

/** A seeded generator, so a failure replays the same walk. */
const seeded = seed => () => {
  seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Offers, open-sea ports, crowded tiles and the widest angle round the island with no port. */
function portStats(mapkey) {
  const tiles = new Board(mapkey).tile_rows.flat()
  const ports = tiles.filter(t => t.trade_edge)
  const targets = ports.map(t => t.adjacent_tiles[t.trade_edge])
  const cells = [...toCells(mapkey)]
  const land = cells.filter(([, t]) => t[0] !== 'S').map(([k]) => k.split(',').map(Number))
  const mx = land.reduce((s, p) => s + p[0], 0) / land.length
  const my = land.reduce((s, p) => s + p[1], 0) / land.length
  const angles = cells.filter(([, t]) => t.startsWith('S(')).map(([k]) => k.split(',').map(Number))
    .map(([x, y]) => Math.atan2((y - my) * 1.5, (x - mx) * 0.866)).sort((a, b) => a - b)
  const gaps = angles.map((a, i) => (i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI) - a)
  return {
    offers: ports.map(t => t.trade_type + t.trade_ratio).sort(),
    facing_sea: targets.filter(t => !t || t.type === 'S').length,
    shared: targets.length - new Set(targets).size,
    widest: Math.max(...gaps) * 180 / Math.PI,
  }
}

/** The xlarge preset with every port pushed onto its bottom-right coast. */
function crowded() {
  const cells = toCells(CONST.MAPS.xlarge.mapkey)
  const offers = []
  for (const [k, t] of cells) { if (t.startsWith('S(')) { offers.push(t.match(/_(.+)\)/)[1]); cells.set(k, 'S') } }
  const dirs = [[-2, 0, 'l'], [2, 0, 'r'], [-1, -1, 'tl'], [1, -1, 'tr'], [-1, 1, 'bl'], [1, 1, 'br']]
  const land = k => cells.get(k)?.[0] && cells.get(k)[0] !== 'S'
  const coast = [...cells.keys()].filter(k => !land(k)).map(k => {
    const [x, y] = k.split(',').map(Number)
    const face = dirs.find(([dx, dy]) => land(`${x + dx},${y + dy}`))
    return face && { k, x, y, dir: face[2] }
  }).filter(Boolean).sort((a, b) => (b.x + 2 * b.y) - (a.x + 2 * a.y))
  offers.forEach((offer, i) => cells.set(coast[i].k, `S(${coast[i].dir}_${offer})`))
  return fromCells(cells)
}

test('bunched ports are spread round the coast', () => {
  const before = portStats(crowded())
  assert.ok(before.widest > 150, 'the fixture really is bunched')
  const after = portStats(balancePorts(crowded(), seeded(1)))
  assert.deepEqual(after.offers, before.offers)
  assert.equal(after.facing_sea, 0)
  assert.equal(after.shared, 0)
  assert.ok(after.widest < 45, `widest gap ${after.widest.toFixed(0)}°`)
})

Object.keys(CONST.MAPS).forEach(id => {
  test(`${id}: balancing keeps every port, facing land, on a tile of its own`, () => {
    const before = portStats(CONST.MAPS[id].mapkey)
    const after = portStats(balancePorts(CONST.MAPS[id].mapkey, seeded(7)))
    assert.deepEqual(after.offers, before.offers)
    assert.equal(after.facing_sea, 0)
    assert.equal(after.shared, 0)
    // Spacing is weighed by distance, not angle, so an even map may trade a few degrees
    assert.ok(after.widest < Math.max(45, before.widest + 1), `widest gap ${after.widest.toFixed(0)}°`)
  })
})
