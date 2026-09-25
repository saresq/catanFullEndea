// Medium: heuristics from dice probability and resources. No search, no card counting, nothing
// tied to the standard board - every number comes from the map it is handed.
import * as CONST from '../../public/js/const.js'
import { bankRate, bankType, canBuy, victimsOn } from './moves.js'
import {
  pips, cornerPips, cornerScore, isFreeSpot, leader, missingFor, total, longestRoadWith, production,
} from './features.js'

const RES = Object.keys(CONST.RESOURCES)
/** States where the seat may build, buy, trade with the bank and play cards */
const ACTING_STATES = [CONST.GAME_STATES.PLAYER_ACTIONS, CONST.GAME_STATES.PAIRED_ACTIONS]
const best = (list, score) => list.reduce((mem, item) => {
  const s = score(item)
  return (!mem || s > mem.s) ? { item, s } : mem
}, null)?.item

// ---------- Placement ----------

/** Value of pointing the first road down `edge`: the best spot it leads to, two corners out. */
function setupRoadValue(view, edge, origin) {
  const far = edge.jumpCorner(origin)
  if (!far) return 0
  return far.getEdges(-1)
    .map(e => e.jumpCorner(far))
    .filter(c => c && c !== origin && isFreeSpot(c))
    .reduce((m, c) => Math.max(m, cornerScore(view.board, c, view.me)), 0)
}

function placement(view, moves) {
  const { board, me } = view
  const corners = [...new Set(moves.map(m => m.settlement_loc))]
  const loc = best(corners, id => cornerScore(board, board.findCorner(id), me))
  const origin = board.findCorner(loc)
  const roads = moves.filter(m => m.settlement_loc === loc)
  return best(roads, m => setupRoadValue(view, board.findEdge(m.road_loc), origin))
}

// ---------- Goals ----------

/** Corners the player's roads already reach. */
function networkCorners(board, me) {
  const ids = new Set()
  me.pieces.R.forEach(loc => {
    const edge = board.findEdge(loc)
    if (edge) { ids.add(edge.corner1.id); ids.add(edge.corner2.id) }
  })
  return ids
}

/** What a new road on `edge` opens up: a settlement spot at its end, or one a road further. */
function edgeValue(view, edge, reached) {
  let value = 0
  ;[edge.corner1, edge.corner2].forEach(end => {
    if (reached.has(end.id)) return
    if (end.piece && end.player_id !== view.pid) return // an opponent's building ends the road
    if (isFreeSpot(end)) {
      value = Math.max(value, 5 + cornerScore(view.board, end, view.me))
    } else {
      end.getEdges(-1).map(e => e.jumpCorner(end)).filter(c => c && !reached.has(c.id) && isFreeSpot(c))
        .forEach(c => { value = Math.max(value, 0.5 * cornerScore(view.board, c, view.me)) })
    }
  })
  return value
}

/** A road that takes (or takes back) Longest Road this turn. */
function longestRoadSwing(view, edges) {
  const { board, me, pid } = view
  if (view.longest_road_pid === pid) return
  const holder = view.players.find(p => p.id === view.longest_road_pid)
  const to_beat = holder ? holder.longest_road_list.length + 1 : view.config.longest_road_count
  if (me.longest_road_list.length + 1 < to_beat) return
  return edges.find(loc => longestRoadWith(board, pid, me.pieces.R, loc) >= to_beat)
}

/**
 * Structurally possible goals in priority order: city, settlement, development card, road.
 * A road only counts when it opens a settlement spot or swings Longest Road.
 */
function goals(view) {
  const { board, me } = view
  const list = []
  const pieces_left = type => CONST.PIECES_COUNT[type] - me.pieces[type].length
  if (me.pieces.S.length && pieces_left('C') > 0) {
    const loc = best(me.pieces.S, id => cornerPips(board.findCorner(id)))
    list.push({ key: 'C', cost: CONST.COST.C, intent: { type: 'build', piece: 'C', loc } })
  }
  const spots = pieces_left('S') > 0 ? board.getSettlementLocationsFromRoads(me.pieces.R) : []
  if (spots.length) {
    const loc = best(spots, id => cornerScore(board, board.findCorner(id), me))
    list.push({ key: 'S', cost: CONST.COST.S, intent: { type: 'build', piece: 'S', loc } })
  }
  if (view.dev_cards_len) { list.push({ key: 'DEV_C', cost: CONST.COST.DEV_C, intent: { type: 'buy_dev' } }) }
  if (pieces_left('R') > 0) {
    const edges = board.getRoadLocationsFromRoads(me.pieces.R, view.pid)
    const reached = networkCorners(board, me)
    const swing = longestRoadSwing(view, edges)
    const opening = (!spots.length && pieces_left('S') > 0)
      ? best(edges.filter(id => edgeValue(view, board.findEdge(id), reached) > 0),
        id => edgeValue(view, board.findEdge(id), reached))
      : undefined
    const loc = swing ?? opening
    if (loc !== undefined) { list.push({ key: 'R', cost: CONST.COST.R, intent: { type: 'build', piece: 'R', loc } }) }
  }
  return list
}

/** The goal closest to done; ties go to the higher priority. Drives discards and trade answers. */
function nearestGoal(view, cards = view.me.closed_cards) {
  return goals(view).reduce((mem, goal) => {
    const short = total(missingFor(cards, goal.cost))
    return (!mem || short < mem.short) ? { goal, short } : mem
  }, null)
}

/** One bank/port trade toward `goal`, only when trading surplus can complete it. */
function bankTradeFor(view, goal) {
  const { me } = view
  const cards = me.closed_cards
  const missing = missingFor(cards, goal.cost)
  const sources = RES.filter(r => !missing[r]).map(res => {
    const rate = bankRate(me, res)
    return { res, rate, trades: Math.floor((cards[res] - (goal.cost[res] || 0)) / rate) }
  }).filter(s => s.trades > 0)
  if (sources.reduce((m, s) => m + s.trades, 0) < total(missing)) return
  const from = sources.sort((a, b) => a.rate - b.rate || b.trades - a.trades)[0]
  return {
    type: 'bank_trade', offer: bankType(me, from.res),
    giving: { [from.res]: from.rate }, taking: { [Object.keys(missing)[0]]: 1 },
  }
}

// ---------- Robber ----------

function robberChoice(view, moves) {
  const { board, pid } = view
  const front = leader(view)
  const tileScore = tile_id => {
    const tile = board.findTile(tile_id)
    const p = pips(+tile.num)
    let score = 0, mine = false
    tile.getAllCorners().forEach(c => {
      if (!c.piece) return
      if (c.player_id === pid) { mine = true; return }
      score += p * (c.piece === 'C' ? 2 : 1) * (c.player_id === front?.id ? 2 : 1)
    })
    return mine ? score - 100 : score // never on itself while another tile exists
  }
  const tile_id = best([...new Set(moves.map(m => m.tile_id))], tileScore)
  const on_tile = moves.filter(m => m.tile_id === tile_id)
  const cardsOf = id => view.players.find(p => p.id === id)?.resource_count || 0
  return on_tile.find(m => m.stolen_pid === front?.id && cardsOf(front.id))
    || best(on_tile, m => cardsOf(m.stolen_pid))
}

// ---------- Development cards ----------

function devCardPlay(view, moves) {
  const { board, me, pid } = view
  const knights = moves.filter(m => m.type === 'knight')
  if (knights.length) {
    const robbed = board.getRobbedTile()?.getAllCorners().some(c => c.piece && c.player_id === pid)
    const holder = view.players.find(p => p.id === view.largest_army_pid)
    const army = me.open_dev_cards.dK + 1
    const takes_army = view.largest_army_pid !== pid
      && (holder ? army > holder.open_dev_cards.dK : army >= view.config.largest_army_count)
    if (robbed || takes_army) return robberChoice(view, knights)
  }
  if (!ACTING_STATES.includes(view.state)) return

  const nearest = nearestGoal(view)
  const missing = nearest ? missingFor(me.closed_cards, nearest.goal.cost) : {}
  const needed = Object.keys(missing).flatMap(res => Array(missing[res]).fill(res))

  if (needed.length && needed.length <= 2 && moves.some(m => m.type === 'year_of_plenty')) {
    return { type: 'year_of_plenty', res1: needed[0], res2: needed[1] || needed[0] }
  }
  if (needed.length && moves.some(m => m.type === 'monopoly')) {
    const others = view.players.filter(p => p.id !== pid && !p.removed).reduce((m, p) => m + p.resource_count, 0)
    if (others >= 6) { return { type: 'monopoly', res: best(Object.keys(missing), res => missing[res]) } }
  }
  const road_moves = moves.filter(m => m.type === 'road_building')
  if (road_moves.length) {
    const reached = networkCorners(board, me)
    const r1 = best(road_moves.map(m => m.r1), id => edgeValue(view, board.findEdge(id), reached))
    const first = board.findEdge(r1)
    if (edgeValue(view, first, reached) > 0 || road_moves.length >= 2) {
      // Second road: anything legal now, or an edge the first road makes reachable
      const onward = [first.corner1, first.corner2].flatMap(c => c.getEdges(-1))
        .filter(e => !e.corner1.surroundedBySea() && !e.corner2.surroundedBySea()).map(e => e.id)
      const after = new Set([...reached, first.corner1.id, first.corner2.id])
      const candidates = [...new Set([...road_moves.map(m => m.r1), ...onward])].filter(id => id !== r1)
      const r2 = best(candidates, id => edgeValue(view, board.findEdge(id), after))
      return { type: 'road_building', r1, r2 }
    }
  }
}

// ---------- Turn ----------

function turn(view, moves) {
  const play = devCardPlay(view, moves)
  if (play) return play
  // A paired action phase plays like the own actions phase; only player trades are off the table
  if (!ACTING_STATES.includes(view.state)) return moves.find(m => m.type === 'roll')

  const cards = view.me.closed_cards
  const list = goals(view)
  for (const [i, goal] of list.entries()) {
    // Don't spend cards a better goal is one card away from, unless a seven would take them anyway
    const saving = list.slice(0, i).some(higher =>
      total(missingFor(cards, higher.cost)) <= 1
      && Object.keys(goal.cost).some(res => higher.cost[res])
      && view.me.resource_count <= view.config.robber_hand_limit)
    if (saving) continue
    if (!total(missingFor(cards, goal.cost))) {
      if (canBuy(view.me, goal.key)) return goal.intent
      continue
    }
    const trade = bankTradeFor(view, goal)
    if (trade) return trade
  }
  return moves.find(m => m.type === 'end_turn')
}

// ---------- Discard & trade answers ----------

function discard(view, move) {
  const cards = { ...view.me.closed_cards }
  const keep = { ...(nearestGoal(view)?.goal.cost || {}) }
  const resources = {}
  for (let i = 0; i < move.count; i++) {
    const spare = r => cards[r] - (keep[r] || 0)
    // Surplus first, biggest pile first; once only goal cards are left, those go too
    const res = best(RES.filter(r => cards[r] > 0), r => spare(r) > 0 ? 100 + spare(r) : cards[r])
    if (!res) break
    cards[res]--
    resources[res] = (resources[res] || 0) + 1
  }
  return { ...move, resources }
}

function tradeAnswer(view, moves) {
  const reject = moves.find(m => !m.accepted)
  const accept = moves.find(m => m.accepted)
  if (!accept) return reject
  const trade = view.ongoing_trades.find(t => t.id === accept.id)
  const giver = view.players.find(p => p.id === trade.pid)
  // Not feeding somebody within two points of winning
  if (!giver || view.config.win_points - giver.public_vps <= 2) return reject
  if (total(trade.asking) > total(trade.giving) + 1) return reject
  const nearest = nearestGoal(view)
  if (!nearest) return reject
  const cards = view.me.closed_cards
  const after_cards = { ...cards }
  Object.entries(trade.giving).forEach(([k, v]) => { after_cards[k] = (after_cards[k] || 0) + v })
  Object.entries(trade.asking).forEach(([k, v]) => { after_cards[k] = (after_cards[k] || 0) - v })
  const short = (goal, hand) => total(missingFor(hand, goal.cost))
  // Some goal gets closer, and the one closest to done is not set back for it
  if (short(nearest.goal, after_cards) > nearest.short) return reject
  return goals(view).some(goal => short(goal, after_cards) < short(goal, cards)) ? accept : reject
}

/**
 * @param {ReturnType<import('./view.js').buildView>} view
 * @param {object[]} moves legal intents from `legalMoves`
 * @returns {object} one intent
 */
export function evaluate(view, moves) {
  switch (moves[0]?.type) {
    case 'initial_build': return placement(view, moves)
    case 'discard': return discard(view, moves[0])
    case 'robber': return robberChoice(view, moves)
    case 'trade_response': return tradeAnswer(view, moves)
    default: return turn(view, moves)
  }
}

// Re-exported for tests, the simulator's reports, and tryhard, which builds on these
export { goals, nearestGoal, production, placement, discard, tradeAnswer, robberChoice, devCardPlay, longestRoadSwing, networkCorners, edgeValue }
