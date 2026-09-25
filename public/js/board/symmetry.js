/**
 * Make a map's outline symmetric: the land moves, the sea around it follows.
 *
 * DOM-free like `map_grid.js`, so it runs under `node --test`.
 *
 * ## Coordinates
 *
 * A tile is `(x, y)`: `y` the row, `x` its position in half tiles. Tile `j` of a row sits at
 * `start + 2j`, and a row's start is its predecessor's plus one (`+`) or minus one (`-`) - see the
 * derivation at the top of `map_grid.js`. So `x` and `y` always have a fixed parity relation, and
 * only the symmetries that keep it are possible on this grid:
 *
 * - `mirror_x`, left against right: `x -> c - x`, for an even `c`.
 * - `mirror_y`, top against bottom: `y -> d - y`, for an even `d` - an odd number of rows, around
 *   a middle one. Pointy hexes have no top-bottom mirror between two rows.
 * - `rotate`, half a turn: `(x, y) -> (c - x, d - y)`, for `c` and `d` of the same parity.
 *
 * A symmetry holds an odd number of tiles only if it leaves some cell in place for the odd one.
 * Mirrors always do (on the axis), a half turn only when its centre `(c/2, d/2)` is a cell and not
 * a corner or an edge between cells.
 */

import { parseRows } from "./map_grid.js"

export const SYMMETRIES = ['mirror_x', 'mirror_y', 'rotate']

const key = (x, y) => `${x},${y}`
const unkey = k => k.split(',').map(Number)
const isLand = token => token && token[0] !== 'S'
const isPort = token => token && token.startsWith('S(')

/** Hex distance between two cells, in tiles. */
const distance = ([x1, y1], [x2, y2]) => {
  const dy = Math.abs(y1 - y2), dx = Math.abs(x1 - x2)
  return dy + Math.max(0, (dx - dy) / 2)
}

const NEIGHBOURS = [[-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]
/** Port direction to use for a neighbour at each offset, as `S(<dir>_…)` spells it. */
const DIR_OF = { '-2,0': 'l', '2,0': 'r', '-1,-1': 'tl', '1,-1': 'tr', '-1,1': 'bl', '1,1': 'br' }
const OFFSET_OF = Object.fromEntries(Object.entries(DIR_OF).map(([k, v]) => [v, unkey(k)]))

/** Every tile of a mapkey by position. */
export function toCells(mapkey) {
  const cells = new Map()
  let start = 0
  parseRows(mapkey).forEach((row, y) => {
    if (y) { start += row.sign === '-' ? -1 : 1 }
    row.tokens.forEach((token, j) => cells.set(key(start + 2 * j, y), token.trim()))
  })
  return cells
}

/**
 * Write positioned tiles back as a mapkey, trimmed to the land and its ports plus one ring of sea.
 * Rows are re-based so the first one starts the file, and every row spans the same width.
 */
export function fromCells(cells) {
  const land = [...cells].filter(([, token]) => isLand(token)).map(([k]) => unkey(k))
  const ports = [...cells].filter(([, token]) => isPort(token)).map(([k]) => unkey(k))
  const used = [...land, ...ports]
  if (!used.length) { return 'S' }
  // One ring of sea round the land, stretched to take in any port that sits further out
  const xs = [...land.flatMap(([x]) => [x - 2, x + 2]), ...ports.map(([x]) => x)]
  const ys = [...land.flatMap(([, y]) => [y - 1, y + 1]), ...ports.map(([, y]) => y)]
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const y0 = Math.min(...ys), y1 = Math.max(...ys)
  // Which x parity each row has: fixed by the grid, read off any tile
  const [px, py] = used[0]
  const width = Math.floor((x1 - x0) / 2) + 1
  const rows = []
  let prev_start
  for (let y = y0; y <= y1; y++) {
    const start = ((x0 - px - (y - py)) % 2 === 0) ? x0 : x0 + 1
    const tokens = []
    for (let x = start; x < start + width * 2; x += 2) {
      const token = cells.get(key(x, y))
      tokens.push(isLand(token) || isPort(token) ? token : 'S')
    }
    const sign = y === y0 ? '' : start > prev_start ? '+' : '-'
    rows.push(sign + tokens.join('.'))
    prev_start = start
  }
  return rows.join('\n')
}

/** The map function of one symmetry around `(c, d)`. */
const mapper = (kind, c, d) => ({
  mirror_x: ([x, y]) => [c - x, y],
  mirror_y: ([x, y]) => [x, d - y],
  rotate: ([x, y]) => [c - x, d - y],
}[kind])

const even = n => n % 2 === 0

/** Whether an axis at `c` (or `d`, or a centre at both) maps tiles onto tiles; see the top. */
const fits = (kind, c, d) => kind === 'mirror_x' ? even(c) : kind === 'mirror_y' ? even(d) : even(c - d)

/**
 * The cells a symmetry leaves where they are, near the land `[x0, x1] × [y0, y1]`: a vertical
 * axis runs through a cell every other row, a horizontal one through a whole row, and a half turn
 * has one only when its centre is a cell rather than a corner or an edge. Only these can take the
 * odd tile of an odd count, so a half turn round a corner can never hold an odd number of tiles.
 */
function fixedCells(kind, c, d, [x0, x1, y0, y1]) {
  const cells = []
  if (kind === 'mirror_x') {
    for (let y = y0 - 1; y <= y1 + 1; y++) { even(c / 2 - y) && cells.push([c / 2, y]) }
  } else if (kind === 'mirror_y') {
    for (let x = x0 - 2; x <= x1 + 2; x++) { even(x - d / 2) && cells.push([x, d / 2]) }
  } else if (even(c) && even(d) && even(c / 2 - d / 2)) {
    cells.push([c / 2, d / 2])
  }
  return cells
}

const bounds = pts => [
  Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0])),
  Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1])),
]

/**
 * The axes (or centres) that make this land symmetric moving the fewest tiles (or up to `slack`
 * more), cheapest first and then nearest the middle.
 *
 * A tile whose image is sea is "lonely", and fixing `L` of them moves `⌈L/2⌉` tiles: half stay
 * and have their images filled by the other half. So the cost of an axis follows from how many
 * tiles it already pairs, and every pair of land tiles votes for the one axis that swaps them.
 * That is `O(n²)` for every axis at once, so none is left out for sitting away from the middle -
 * an irregular map's best axis often does.
 */
function axesFor(cells, kind, slack = 0) {
  const land = [...cells].filter(([, token]) => isLand(token)).map(([k]) => k)
  if (!land.length) { return [] }
  const pts = land.map(unkey)
  const box = bounds(pts)
  const cx = box[0] + box[1], cy = box[2] + box[3]
  const votes = new Map()
  for (const [xa, ya] of pts) {
    for (const [xb, yb] of pts) {
      // A mirror only swaps tiles on one row (or one column); the other coordinate is free
      if (kind === 'mirror_x' && ya !== yb) { continue }
      if (kind === 'mirror_y' && xa !== xb) { continue }
      const c = kind === 'mirror_y' ? cx : xa + xb
      const d = kind === 'mirror_x' ? cy : ya + yb
      if (!fits(kind, c, d)) { continue }
      votes.set(key(c, d), (votes.get(key(c, d)) || 0) + 1)
    }
  }
  const land_set = new Set(land)
  // Axes that pair nothing count too: with the rounding up, one pairing a tile less can move no
  // more tiles than the best, and may be the one that keeps the island in one piece
  const centres = []
  for (let c = 2 * box[0] - 4; c <= 2 * box[1] + 4; c++) {
    for (let d = 2 * box[2] - 4; d <= 2 * box[3] + 4; d++) {
      const free = kind === 'mirror_x' ? d === cy : kind === 'mirror_y' ? c === cx : true
      if (free && fits(kind, c, d)) { centres.push([c, d]) }
    }
  }
  return centres.map(([c, d]) => {
    const lonely_count = land.length - (votes.get(key(c, d)) || 0)
    // An odd count needs a cell the symmetry fixes; without one no amount of moving gets there
    const possible = even(lonely_count) || fixedCells(kind, c, d, box).length
    return { kind, c, d, cost: Math.ceil(lonely_count / 2), off: Math.abs(c - cx) + Math.abs(d - cy), possible }
  }).filter(axis => axis.possible)
    .sort((a, b) => a.cost - b.cost || a.off - b.off)
    // Only the cheapest few are worth building; the rest never win
    .filter((axis, i, all) => axis.cost <= all[0].cost + slack
      && i - all.findIndex(a => a.cost === axis.cost) < 24)
    .map(({ possible, ...axis }) => {
      const map = mapper(kind, axis.c, axis.d)
      return { ...axis, map, box, lonely: land.filter(k => !land_set.has(key(...map(unkey(k))))) }
    })
}

/**
 * The best placed axis (or centre) for one symmetry: the one leaving the fewest land tiles whose
 * mirror image is sea, and that can take an odd tile if there is one.
 * @returns {{ kind, c, d, map, lonely: string[], cost: number } | null}
 */
export function bestAxis(cells, kind) {
  return axesFor(cells, kind)[0] || null
}

/** How many of a cell's neighbours are in `set`. */
const touching = (k, set) => {
  const [x, y] = unkey(k)
  return NEIGHBOURS.filter(([dx, dy]) => set.has(key(x + dx, y + dy))).length
}

/** Separate islands in a set of cells. */
function pieces(set) {
  const seen = new Set()
  let n = 0
  for (const start of set) {
    if (seen.has(start)) { continue }
    n++
    const stack = [start]
    seen.add(start)
    while (stack.length) {
      const [x, y] = unkey(stack.pop())
      NEIGHBOURS.map(([dx, dy]) => key(x + dx, y + dy)).filter(k => set.has(k) && !seen.has(k))
        .forEach(k => { seen.add(k); stack.push(k) })
    }
  }
  return n
}

/**
 * The outline one axis leads to, and which tiles move where. Tiles already paired stay; of the
 * lonely ones half stay, and which half decides the shape. They are picked one at a time, each
 * time the one (with its image) touching the most of the outline so far: that fills bays first,
 * grows the island out from its paired core instead of leaving bits of it floating, and leaves
 * the spits - lonely tiles touching little - to be the ones that move.
 */
function plan(cells, axis) {
  const land = [...cells].filter(([, token]) => isLand(token)).map(([k]) => k)
  const land_set = new Set(land)
  const image = k => key(...axis.map(unkey(k)))
  const centre = [axis.c / 2, axis.d / 2]
  const shape = new Set(land.filter(k => land_set.has(image(k))))
  // Lower is better, compared in order: touching more, not covering a port, nearer the middle
  const rank = k => [-touching(k, shape) - touching(image(k), shape),
    isPort(cells.get(image(k))) ? 1 : 0, distance(unkey(k), centre)]
  const better = (a, b) => (a.map((n, i) => n - b[i]).find(n => n) || 0) < 0
  const pickBest = list => list.reduce((best, k) => !best || better(rank(k), rank(best)) ? k : best, null)

  let keep = Math.floor(axis.lonely.length / 2)
  let spare = axis.lonely.length % 2
  const fixed = fixedCells(axis.kind, axis.c, axis.d, axis.box).map(p => key(...p))
  // An odd count and no free fixed cell - a half turn whose centre is land already. Then the
  // centre tile moves out too and one more lonely pair stays: the same number of moves.
  if (spare && fixed.every(k => shape.has(k))) {
    shape.delete(fixed[0])
    keep++
    spare = 0
  }
  const pool = [...axis.lonely]
  for (let n = 0; n < keep; n++) {
    const k = pickBest(pool)
    pool.splice(pool.indexOf(k), 1)
    shape.add(k)
    shape.add(image(k))
  }
  if (spare) { shape.add(pickBest(fixed.filter(k => !shape.has(k)))) }

  // Each moving tile goes to a new place, the closest pairs first
  const from = land.filter(k => !shape.has(k))
  const to = [...shape].filter(k => !land_set.has(k))
  const options = from.flatMap(f => to.map(t => [distance(unkey(f), unkey(t)), f, t]))
    .sort((a, b) => a[0] - b[0])
  const used = new Set(), moves = []
  options.forEach(([, f, t]) => {
    if (used.has(f) || used.has(t)) { return }
    used.add(f)
    used.add(t)
    moves.push([f, t])
  })
  const coast = [...shape].reduce((sum, k) => sum + 6 - touching(k, shape), 0)
  return { axis, moves, pieces: pieces(shape), coast }
}

/**
 * The plan to carry out for one symmetry, or `null` if the map already has it. Of the axes that
 * move as few tiles as possible, the one giving the fewest islands and then the shortest coast
 * wins. If even that one breaks the land into more islands than it had, the axes moving one tile
 * more get a look too: one extra move is a fair price for not leaving a tile out at sea.
 */
function choosePlan(cells, kind) {
  const axes = axesFor(cells, kind)
  if (!axes.length || !axes[0].cost) { return null }
  const pick = plans => plans.reduce((a, b) => {
    const order = [b.pieces - a.pieces, b.moves.length - a.moves.length, b.coast - a.coast].find(n => n)
    return order < 0 ? b : a
  })
  const best = pick(axes.map(axis => plan(cells, axis)))
  const was = pieces(new Set([...cells].filter(([, token]) => isLand(token)).map(([k]) => k)))
  return best.pieces > was ? pick([best, ...axesFor(cells, kind, 1).map(axis => plan(cells, axis))]) : best
}

/**
 * How many land tiles {@link symmetrize} would move for each symmetry; `0` means it already has
 * it. Builds the same plans, so the number shown is the number that moves.
 */
export function symmetryReport(mapkey) {
  const cells = toCells(mapkey)
  return Object.fromEntries(SYMMETRIES.map(kind => [kind, choosePlan(cells, kind)?.moves.length || 0]))
}

/**
 * Make the outline symmetric without changing what is on it: every tile that has no mirror image
 * either gets one or moves out, half and half. The tiles that move out carry their terrain and
 * number to the new places, so the land count and the resource and number mix come out as they
 * went in.
 *
 * Ports stay where they are unless land now covers them, in which case they go to the nearest
 * free coast; a port left facing open sea turns to face land.
 * @returns {{ mapkey: string, moved: number }}
 */
export function symmetrize(mapkey, kind) {
  const cells = toCells(mapkey)
  const best = choosePlan(cells, kind)
  if (!best) { return { mapkey, moved: 0 } }

  const displaced_ports = []
  const tokens = best.moves.map(([from]) => cells.get(from))
  best.moves.forEach(([from, to], i) => {
    if (isPort(cells.get(to))) { displaced_ports.push({ token: cells.get(to), from: to }) }
    cells.set(from, 'S')
    cells.set(to, tokens[i])
  })

  repairPorts(cells, displaced_ports)
  return { mapkey: fromCells(cells), moved: best.moves.length }
}

/** Land neighbours of a cell, as `[direction, cell]`. */
const landAround = (cells, k) => {
  const [x, y] = unkey(k)
  return NEIGHBOURS.map(([dx, dy]) => [DIR_OF[`${dx},${dy}`], key(x + dx, y + dy)])
    .filter(([, n]) => isLand(cells.get(n)))
}

/** The six directions going round a hex, so a port can turn as little as it has to. */
const RING = ['tl', 'tr', 'r', 'br', 'bl', 'l']
const closestTurn = (facing, dir) => {
  const turn = d => { const n = Math.abs(RING.indexOf(d) - RING.indexOf(dir)); return Math.min(n, 6 - n) }
  return facing.map(([d]) => d).sort((a, b) => turn(a) - turn(b))[0]
}

/**
 * Turn every port facing open sea towards land, and put the ports land has covered (or that have
 * no land left beside them) back on the coast, at the free sea tile nearest where they were.
 */
function repairPorts(cells, displaced) {
  const portOf = token => token.match(/^S\((\w+)_(.+)\)$/)
  for (const [k, token] of cells) {
    if (!isPort(token)) { continue }
    const [, dir, offer] = portOf(token)
    const [x, y] = unkey(k)
    const [dx, dy] = OFFSET_OF[dir] || [0, 0]
    if (isLand(cells.get(key(x + dx, y + dy)))) { continue }
    const facing = landAround(cells, k)
    if (facing.length) { cells.set(k, `S(${closestTurn(facing, dir)}_${offer})`) }
    else { cells.set(k, 'S'); displaced.push({ token, from: k }) }
  }
  displaced.forEach(({ token, from }) => {
    const [, dir, offer] = portOf(token)
    // Grid cells and the ring around the land both count: the coast may have moved past the grid
    const around = [...cells].filter(([, t]) => isLand(t))
      .flatMap(([k]) => NEIGHBOURS.map(([dx, dy]) => key(unkey(k)[0] + dx, unkey(k)[1] + dy)))
    const coast = [...new Set([...cells.keys(), ...around])]
      .filter(k => !isLand(cells.get(k)) && !isPort(cells.get(k)))
      .map(k => [k, landAround(cells, k)]).filter(([, facing]) => facing.length)
    if (!coast.length) { return }
    coast.sort((a, b) => distance(unkey(a[0]), unkey(from)) - distance(unkey(b[0]), unkey(from)))
    const [k, facing] = coast[0]
    cells.set(k, `S(${closestTurn(facing, dir)}_${offer})`)
  })
}
