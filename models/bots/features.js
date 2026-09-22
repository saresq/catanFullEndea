// Map-agnostic board and hand features for the evaluators. Everything is derived from the board's
// own graph (tiles -> corners -> edges), never from the standard layout or a player count.
import * as CONST from '../../public/js/const.js'

const RES = Object.keys(CONST.RESOURCES)

/** Ways out of 36 to roll `n`, as pips: 6/8 -> 5, 2/12 -> 1, anything else -> 0. */
export const pips = n => (n >= 2 && n <= 12 && +n !== CONST.ROBBER_ROLL) ? 6 - Math.abs(7 - n) : 0

/** @type {WeakMap<object, { corners: any[], land_pips: Object<string, number> }>} */
const BOARD_CACHE = new WeakMap()
function boardInfo(board) {
  let info = BOARD_CACHE.get(board)
  if (!info) {
    const corners = new Map()
    const land_pips = Object.fromEntries(RES.map(r => [r, 0]))
    board.tile_rows.flat().forEach(tile => {
      const res = CONST.TILE_RES[tile.type]
      if (res) { land_pips[res] += pips(+tile.num) }
      tile.getAllCorners().forEach(c => c && corners.set(c.id, c))
    })
    info = { corners: [...corners.values()], land_pips }
    BOARD_CACHE.set(board, info) // the tile layout never changes during a game
  }
  return info
}

export const allCorners = board => boardInfo(board).corners

/** Pips per resource a building on this corner produces. */
export function cornerYield(corner) {
  const out = {}
  corner.tiles.forEach(tile => {
    const res = CONST.TILE_RES[tile.type]
    if (res) { out[res] = (out[res] || 0) + pips(+tile.num) }
  })
  return out
}

export const cornerPips = corner => Object.values(cornerYield(corner)).reduce((m, v) => m + v, 0)

/** Resources that are rare on this map are worth a little more. 1 on an even map. */
export function scarcity(board, res) {
  const { land_pips } = boardInfo(board)
  const avg = RES.reduce((m, r) => m + land_pips[r], 0) / RES.length
  if (!avg || !land_pips[res]) return 1
  return Math.max(0.85, Math.min(1.3, avg / land_pips[res]))
}

/** Pips per resource the player's settlements and cities produce, robbed tiles excluded. */
export function production(board, player) {
  const out = Object.fromEntries(RES.map(r => [r, 0]))
  const add = (loc, mult) => board.findCorner(loc)?.tiles.forEach(tile => {
    const res = CONST.TILE_RES[tile.type]
    if (res && !tile.robbed) { out[res] += pips(+tile.num) * mult }
  })
  player.pieces.S.forEach(loc => add(loc, 1))
  player.pieces.C.forEach(loc => add(loc, 2))
  return out
}

/**
 * How good a corner is to settle for `player`: dice probability first, then variety, resources the
 * player does not produce yet, and a port that fits what they make.
 */
export function cornerScore(board, corner, player) {
  const yields = cornerYield(corner)
  const owned = production(board, player)
  let score = 0
  Object.entries(yields).forEach(([res, p]) => {
    score += p * scarcity(board, res)
    if (!owned[res]) { score += 1.5 } // covers something new
  })
  score += Object.keys(yields).length * 0.5
  if (corner.trade) { score += portFit(corner.trade, owned, yields) }
  return score
}

/** Value of owning a port: 3:1 is mildly useful to anyone, 2:1 as much as its resource flows in. */
export function portFit(trade, owned = {}, extra = {}) {
  if (trade === '*3') return 1
  const res = trade[0]
  return Math.min(3, ((owned[res] || 0) + (extra[res] || 0)) * 0.4)
}

/** A corner a settlement may legally stand on (distance rule), ignoring how to get a road there. */
export const isFreeSpot = corner => !corner.piece && corner.hasNoNeighbours()
  && corner.tiles.some(t => t.type !== 'S')

/** Public points of the opponent in front. `undefined` when there are no opponents left. */
export function leader(view) {
  return view.players
    .filter(p => p.id !== view.pid && !p.removed)
    .sort((a, b) => b.public_vps - a.public_vps || b.resource_count - a.resource_count)[0]
}

/** Cards still missing for `cost`, as `{ res: n }`. Empty when affordable. */
export function missingFor(cards, cost) {
  const out = {}
  Object.entries(cost).forEach(([res, n]) => {
    const short = n - (cards[res] || 0)
    if (short > 0) { out[res] = short }
  })
  return out
}
export const total = obj => Object.values(obj).reduce((m, v) => m + v, 0)

/**
 * Longest road the player would have with `extra_edge` added, without touching the board.
 * Same rule as `Board.findLongestPathFromRoads`: an opponent's building cuts the road.
 */
export function longestRoadWith(board, pid, roads, extra_edge) {
  const owned = new Set(extra_edge === undefined ? roads : [...roads, extra_edge])
  const used = new Set()
  const walk = (edge, from) => {
    used.add(edge.id)
    let best = 0
    ;[edge.corner1, edge.corner2].forEach(corner => {
      if (corner === from) return
      if (corner.player_id && corner.player_id !== pid) return
      corner.getEdges(null).forEach(next => {
        if (owned.has(next.id) && !used.has(next.id)) { best = Math.max(best, walk(next, corner)) }
      })
    })
    used.delete(edge.id)
    return 1 + best
  }
  let longest = 0
  owned.forEach(id => {
    const edge = board.findEdge(id)
    if (!edge) return
    longest = Math.max(longest, walk(edge, edge.corner1), walk(edge, edge.corner2))
  })
  return longest
}
