/**
 * Tidy shapes: re-lay a map's land as an outline that is symmetric across both axes and rounded,
 * the way the printed boards are, instead of mending the outline it already has.
 *
 * DOM-free like `symmetry.js`, and in the same coordinates: `(x, y)`, `x` in half tiles, `y` the
 * row. Both mirrors at once need a centre `(X, Y)` on a row (`y -> 2Y - y` keeps the grid only
 * around a row), with `X` either on a tile (the middle row has an odd length) or between two (an
 * even one). A cell and its mirror images make an orbit of 4, 2 on an axis, or 1 at the centre.
 *
 * A shape is grown from the centre, orbit by orbit, in order of a hex distance that can be
 * stretched sideways - the stretch is what makes the long boards - and ties go to the orbit
 * nearest in plain distance, so a ring that is only partly filled fills from its flat sides.
 */

import { fromCells, toCells } from "./symmetry.js"

const key = (x, y) => `${x},${y}`
const unkey = k => k.split(',').map(Number)
const isLand = token => token && token[0] !== 'S'
const isPort = token => token && token.startsWith('S(')

const NEIGHBOURS = [[-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]
/** Port directions clockwise from the right, so how far a port turns is a distance in this list. */
const DIRS = ['r', 'br', 'bl', 'l', 'tl', 'tr']
const OFFSET = { r: [2, 0], br: [1, 1], bl: [-1, 1], l: [-2, 0], tl: [-1, -1], tr: [1, -1] }

/** Screen-space distance between cells: a half tile is √3/2 wide, a row 1.5 tall. */
const euclid = ([x1, y1], [x2, y2]) => Math.hypot((x1 - x2) * 0.866, (y1 - y2) * 1.5)

/** How far sideways the shape is stretched, in half tiles: round, long, longer. */
const STRETCHES = [0, 2, 4]

/** How many dice numbers of each a balanced board carries, per two of the middle numbers. */
const NUMBER_WEIGHT = { 2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 1 }
const RESOURCE_TILES = ['G', 'J', 'C', 'M', 'F']

/** Tile-sea borders along a set of cells: fewer is rounder. */
function perimeter(shape) {
  let edges = 0
  shape.forEach(k => {
    const [x, y] = unkey(k)
    NEIGHBOURS.forEach(([dx, dy]) => { if (!shape.has(key(x + dx, y + dy))) { edges++ } })
  })
  return edges
}

/**
 * The shapes one centre and stretch can give around `n` tiles: the one with exactly `n`, if the
 * orbits add up to it without leaving the ring being filled, and the nearest complete steps
 * below and above, which are rounder but change the tile count.
 */
function grow(n, X, Y, stretch, parity) {
  const radius = Math.ceil(Math.sqrt(n)) + 4
  const seen = new Set()
  const orbits = []
  for (let y = Y - radius; y <= Y + radius; y++) {
    for (let x = X - 2 * radius - stretch; x <= X + 2 * radius + stretch; x++) {
      // Only real cells: on this grid every tile's `x + y` has the same parity
      if (((x + y) % 2 + 2) % 2 !== parity) { continue }
      const k = key(x, y)
      if (seen.has(k)) { continue }
      const orbit = [...new Set([key(x, y), key(2 * X - x, y), key(x, 2 * Y - y), key(2 * X - x, 2 * Y - y)])]
      orbit.forEach(o => seen.add(o))
      const dx = Math.max(0, Math.abs(x - X) - stretch), dy = Math.abs(y - Y)
      orbits.push({ cells: orbit, ring: dy + Math.max(0, (dx - dy) / 2), near: euclid([x, y], [X, Y]) })
    }
  }
  orbits.sort((a, b) => a.ring - b.ring || a.near - b.near)

  const shapes = []
  const shape = new Set()
  let i = 0
  // Complete steps: every orbit in order, as long as the whole of the next one still fits
  for (; i < orbits.length && shape.size + orbits[i].cells.length <= n; i++) {
    orbits[i].cells.forEach(k => shape.add(k))
  }
  if (shape.size === n) { return [new Set(shape)] }
  if (shape.size) { shapes.push(new Set(shape)) }
  if (i < orbits.length) { shapes.push(new Set([...shape, ...orbits[i].cells])) }

  // Exact count: smaller orbits from the same ring, or the next, that touch what is there
  const exact = new Set(shape)
  const ring = orbits[i]?.ring
  for (let j = i; j < orbits.length && orbits[j].ring <= ring + 1 && exact.size < n; j++) {
    const cells = orbits[j].cells
    if (exact.size + cells.length > n) { continue }
    if (!cells.some(k => { const [x, y] = unkey(k); return NEIGHBOURS.some(([dx, dy]) => exact.has(key(x + dx, y + dy))) })) { continue }
    cells.forEach(k => exact.add(k))
  }
  if (exact.size === n) { shapes.push(exact) }
  return shapes
}

/** A shape moved so its first cell sits at the origin, to tell apart shapes that only differ in place. */
function signature(shape) {
  const pts = [...shape].map(unkey)
  const x0 = Math.min(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1]))
  return pts.map(([x, y]) => key(x - x0, y - y0)).sort().join(' ')
}

/**
 * Tidy outlines for the land of `mapkey`, best first: shapes with the same number of tiles, then
 * the closest ones with a few more or a few less, each as `{ shape, delta }`.
 */
export function tidyShapes(mapkey) {
  const cells = toCells(mapkey)
  const land = [...cells].filter(([, token]) => isLand(token)).map(([k]) => unkey(k))
  const n = land.length
  if (n < 2) { return [] }
  const parity = ((land[0][0] + land[0][1]) % 2 + 2) % 2
  const mx = land.reduce((s, p) => s + p[0], 0) / n
  const my = land.reduce((s, p) => s + p[1], 0) / n

  const found = new Map()
  for (let Y = Math.round(my) - 1; Y <= Math.round(my) + 1; Y++) {
    for (let X = Math.floor(mx) - 1; X <= Math.ceil(mx) + 1; X++) {
      STRETCHES.forEach(stretch => grow(n, X, Y, stretch, parity).forEach(shape => {
        const sig = signature(shape)
        // The same outline from another centre: keep the one nearest where the land already is
        const shift = euclid([X, Y], [mx, my])
        const prev = found.get(sig)
        if (!prev || shift < prev.shift) {
          found.set(sig, { shape, delta: shape.size - n, edges: perimeter(shape), shift, stretch })
        }
      }))
    }
  }

  // Round first, then close to the count; a shape that changes the count has to be much rounder
  // than one that does not to be worth offering
  const all = [...found.values()].sort((a, b) =>
    (a.edges + 3 * Math.abs(a.delta)) - (b.edges + 3 * Math.abs(b.delta)) || a.shift - b.shift)
  const picks = []
  const take = pred => { const s = all.find(o => pred(o) && !picks.includes(o)); if (s) { picks.push(s) } }
  take(o => o.delta === 0)
  take(o => o.delta === 0 && o.stretch !== picks[0]?.stretch)
  take(o => o.delta > 0 && o.delta <= 6)
  take(o => o.delta < 0 && o.delta >= -6)
  return picks.map(({ shape, delta }) => ({ shape, delta }))
}

/** New tiles for grown shapes: the scarcest resource, with the number the board is shortest of. */
function freshTiles(tokens, count) {
  const res = Object.fromEntries(RESOURCE_TILES.map(t => [t, 0]))
  const nums = Object.fromEntries(Object.keys(NUMBER_WEIGHT).map(k => [k, 0]))
  tokens.forEach(token => {
    if (res[token[0]] !== undefined) { res[token[0]]++ }
    const num = token.slice(1)
    if (nums[num] !== undefined) { nums[num]++ }
  })
  const out = []
  for (let i = 0; i < count; i++) {
    const type = RESOURCE_TILES.reduce((a, b) => res[b] < res[a] ? b : a)
    const num = Object.keys(nums).reduce((a, b) => nums[b] / NUMBER_WEIGHT[b] < nums[a] / NUMBER_WEIGHT[a] ? b : a)
    res[type]++
    nums[num]++
    out.push(type + num)
  }
  return out
}

/**
 * Put the map's tiles onto `shape`. Tiles keep their places where the shape has them, and the rest
 * move the shortest way; a smaller shape drops the tiles furthest out, a bigger one gets new tiles.
 * Ports go to the free coast nearest where they were, facing as close to their old way as they can.
 * @returns {{ mapkey: string, added: string[], removed: string[], fresh: string[] }}
 */
export function applyShape(mapkey, shape) {
  const cells = toCells(mapkey)
  const land = [...cells].filter(([, token]) => isLand(token))
  const targets = [...shape]

  // Nearest pairs first, across the whole map, so a tile only travels when its spot is gone
  const pairs = []
  land.forEach(([from]) => targets.forEach(to => pairs.push([euclid(unkey(from), unkey(to)), from, to])))
  pairs.sort((a, b) => a[0] - b[0])
  const placed = new Map(), used_from = new Set()
  pairs.forEach(([, from, to]) => {
    if (used_from.has(from) || placed.has(to)) { return }
    used_from.add(from)
    placed.set(to, cells.get(from))
  })
  const removed = land.filter(([from]) => !used_from.has(from)).map(([, token]) => token)
  const empty = targets.filter(k => !placed.has(k))
  const added = freshTiles([...placed.values()], empty.length)
  empty.forEach((k, i) => placed.set(k, added[i]))

  const out = new Map(placed)
  const ports = [...cells].filter(([, token]) => isPort(token))
  ports.forEach(([from, token]) => {
    const [, dir, offer] = token.match(/^S\((\w+)_(.+)\)$/)
    const coast = [...new Set([...placed.keys()].flatMap(k => {
      const [x, y] = unkey(k)
      return NEIGHBOURS.map(([dx, dy]) => key(x + dx, y + dy))
    }))].filter(k => !placed.has(k) && !isPort(out.get(k)))
    if (!coast.length) { return }
    // Two ports side by side share a corner; keep them a tile apart when there is room to
    const crowded = k => { const [x, y] = unkey(k); return NEIGHBOURS.some(([dx, dy]) => isPort(out.get(key(x + dx, y + dy)))) }
    const roomy = coast.filter(k => !crowded(k))
    const pool = roomy.length ? roomy : coast
    pool.sort((a, b) => euclid(unkey(a), unkey(from)) - euclid(unkey(b), unkey(from)))
    const at = pool[0]
    const [x, y] = unkey(at)
    const faces = DIRS.filter(d => placed.has(key(x + OFFSET[d][0], y + OFFSET[d][1])))
    const turn = d => { const i = Math.abs(DIRS.indexOf(d) - DIRS.indexOf(dir)); return Math.min(i, 6 - i) }
    faces.sort((a, b) => turn(a) - turn(b))
    out.set(at, `S(${faces[0]}_${offer})`)
  })

  return { mapkey: fromCells(out), added, removed, fresh: empty }
}
