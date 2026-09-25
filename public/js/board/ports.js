/**
 * Even out a map's ports: no two opening onto the same land tile, none sharing a corner, and all
 * of them spread around the coast instead of bunched on one stretch of it.
 *
 * DOM-free, so it runs under `node --test`. Positions are `(x, y)` with `x` in half tiles, the
 * same coordinates as `symmetry.js`: row `y` starts one half tile left (`-`) or right (`+`) of
 * the row above it.
 */

import * as CONST from "../const.js"
import Board from "./board.js"
import { parseRows, serializeRows } from "./map_grid.js"

const EDGES = Object.values(CONST.DIR_HELPER.KEYS)

/** Hex distance between two positions, in tiles. */
const distance = ([x1, y1], [x2, y2]) => {
  const dy = Math.abs(y1 - y2), dx = Math.abs(x1 - x2)
  return dy + Math.max(0, (dx - dy) / 2)
}

/** What each part of the score weighs. Crowding a tile is worst; bunching is a pull, not a rule. */
const WEIGHT = { same_tile: 10, same_corner: 3, bunching: 4, turn: 0.1, move: 0.3 }
const STEPS = 8000

/**
 * @param {string} mapkey
 * @param {() => number} [random] injectable for tests
 * @returns {string} the mapkey with its ports moved, or the same one when nothing is better
 */
export function balancePorts(mapkey, random = Math.random) {
  const board = new Board(mapkey)
  const tiles = board.tile_rows.flat()
  const pos = new Map()
  let start = 0
  board.tile_rows.forEach((row, y) => {
    if (y) { start += row.diff }
    row.forEach((tile, j) => pos.set(tile, [start + 2 * j, y]))
  })

  const isLand = tile => tile && tile.type !== 'S'
  const facing = tile => EDGES.filter(dir => isLand(tile.adjacent_tiles[dir]))
  const ports = tiles.filter(tile => tile.type === 'S' && tile.trade_edge && facing(tile).length)
    .map(tile => ({ tile, dir: tile.trade_edge, origin: tile, type: tile.trade_type, ratio: tile.trade_ratio }))
  if (ports.length < 2) { return mapkey }
  // Any stretch of coast will do: a port may cross the map if that is where the gap is
  const coast = tiles.filter(tile => tile.type === 'S' && facing(tile).length)
  // Ports that face open sea are left where they are and never land on
  const stuck = new Set(tiles.filter(tile => tile.trade_edge && !facing(tile).length))

  const cost = () => {
    const targets = new Map(), corners = new Map()
    let score = 0
    ports.forEach(({ tile, dir, origin }, i) => {
      const target = tile.adjacent_tiles[dir]
      targets.set(target, (targets.get(target) || 0) + 1)
      CONST.DIR_HELPER.EDGE_TO_CORNERS[dir].forEach(c => {
        const corner = tile.corners[c]
        if (corner) { corners.set(corner, (corners.get(corner) || 0) + 1) }
      })
      score += tile !== origin ? WEIGHT.move : dir !== origin.trade_edge ? WEIGHT.turn : 0
      // Every pair of ports pushes apart, hardest when close: the ports settle evenly spaced
      for (let j = i + 1; j < ports.length; j++) {
        const d = distance(pos.get(tile), pos.get(ports[j].tile))
        score += WEIGHT.bunching / (d * d)
      }
    })
    const extra = map => [...map.values()].reduce((sum, n) => sum + Math.max(0, n - 1), 0)
    return score + extra(targets) * WEIGHT.same_tile + extra(corners) * WEIGHT.same_corner
  }

  // Annealing: a random walk that takes a worse setup now and then, less often as it cools, and
  // keeps the best one seen. Plain greedy gets stuck when two ports have to move together.
  const snapshot = () => ports.map(({ tile, dir }) => ({ tile, dir }))
  let score = cost(), best = score, best_setup = snapshot()
  const start_score = score
  const pick = list => list[Math.floor(random() * list.length)]
  for (let step = 0; step < STEPS; step++) {
    const heat = 2 * (1 - step / STEPS) + 0.01
    const port = pick(ports)
    // Half the tries only turn the port, so a small fix is found without a long walk
    const tile = random() < 0.5 ? port.tile : pick(coast)
    if (tile !== port.tile && (stuck.has(tile) || ports.some(p => p.tile === tile))) { continue }
    const dir = pick(facing(tile))
    const was = { tile: port.tile, dir: port.dir }
    Object.assign(port, { tile, dir })
    const next = cost()
    if (next > score && random() > Math.exp((score - next) / heat)) { Object.assign(port, was); continue }
    score = next
    if (score < best) { best = score; best_setup = snapshot() }
  }
  if (best >= start_score) { return mapkey }
  ports.forEach((port, i) => Object.assign(port, best_setup[i]))

  // Written back in two steps, every port's old tile cleared before any is placed, so one that
  // moved onto a tile another has just left is not wiped out
  const rows = parseRows(board.generateMapKey())
  const at = new Map()
  board.tile_rows.forEach((row, r) => row.forEach((tile, c) => at.set(tile, [r, c])))
  ports.forEach(({ origin }) => {
    const [r, c] = at.get(origin)
    rows[r].tokens[c] = 'S'
  })
  ports.forEach(({ tile, dir, type, ratio }) => {
    const [r, c] = at.get(tile)
    rows[r].tokens[c] = `S(${CONST.DIR_HELPER.MAPKEYS[dir]}_${type}${ratio})`
  })
  return serializeRows(rows)
}
