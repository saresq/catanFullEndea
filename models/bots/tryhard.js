// Tryhard: plans the whole turn one ply deep, counts cards from public events, races at the end.
// Placement, discards, knights and trade answers start from medium's and are sharpened by the
// count. Still no search beyond this turn and nothing hidden read: `view.counted` is built from the
// same events every seat is told about.
import * as CONST from '../../public/js/const.js'
import { bankRate, bankType, canAfford } from './moves.js'
import {
  pips, cornerScore, cornerPips, missingFor, total, leader, longestRoadWith,
  productionOf, weightedPips, reachableSpots, devCardVp,
} from './features.js'
import {
  placement as mediumPlacement, discard, tradeAnswer, robberChoice as mediumRobber, devCardPlay, longestRoadSwing,
} from './medium.js'

const RES = Object.keys(CONST.RESOURCES)
const best = (list, score) => list.reduce((mem, item) => {
  const s = score(item)
  return (!mem || s > mem.s) ? { item, s } : mem
}, null)?.item

/** Tuning knobs, all in one place for the simulator runs. */
export const WEIGHTS = {
  vp: 10,        // one victory point
  prod: 0.55,    // one weighted pip of production per roll
  spot: 0.35,    // best settlement spot still reachable (its corner score)
  deny: 0.3,     // pips taken from the visible leader's best spot
  hand: 0.6,     // each card over the robber hand limit
  road_open: 0.5,// a road that brings a new spot within reach
  road_len: 0,   // each step a road adds to the longest road (roads only pay when they open a spot or take the title)
  keep: 0.15,    // each card kept: spending everything on a dev card is not free
  dev: 1,        // multiplier on a development card's expected value
  expand: 0.4,   // placement: weight of the best spot a first road can reach
  knight: 1,     // play a knight whenever it is held (1) or only when robbed / for the army (0)
  give_scarce: 1, // offer the surplus card the table holds least of (1) or the deepest pile (0)
  ask_two: 0,    // offer two cards for one when the surplus is deep (1) or always ask one for one (0)
}
export const PLAN_STEPS = 3
export const PLAN_CAP = 200

// ---------- Plan state ----------

/** A plan works on copies: hands and piece lists, never the live board. */
function initial(view) {
  const me = view.me
  return {
    cards: { ...me.closed_cards },
    pieces: { S: me.pieces.S.slice(), C: me.pieces.C.slice(), R: me.pieces.R.slice() },
    vp: me.public_vps + (me.private_vps || 0),
    taken_spots: [], dev_bought: 0, steps: [], road_value: 0,
  }
}

function raceMode(view) {
  return view.players.some(p => p.id !== view.pid && !p.removed && p.public_vps + 2 >= view.config.win_points)
}

function stateValue(view, state, spots, leader_spots) {
  const { board } = view
  const prod = productionOf(board, state.pieces)
  let value = state.vp * WEIGHTS.vp + weightedPips(board, prod) * WEIGHTS.prod
  const free_at = spots.at.filter(id => !state.taken_spots.includes(id))
  const free_near = spots.near.filter(id => !state.taken_spots.includes(id))
  const spot_score = id => cornerScore(board, board.findCorner(id), { pieces: state.pieces })
  const best_spot = Math.max(0, ...free_at.map(spot_score), ...free_near.map(id => spot_score(id) * 0.6))
  if (CONST.PIECES_COUNT.S > state.pieces.S.length) { value += best_spot * WEIGHTS.spot }
  state.taken_spots.forEach(id => {
    if (leader_spots.has(id)) { value += cornerPips(board.findCorner(id)) * WEIGHTS.deny }
  })
  const held = total(state.cards)
  value -= Math.max(0, held - view.config.robber_hand_limit) * WEIGHTS.hand
  value += Math.min(held, view.config.robber_hand_limit) * WEIGHTS.keep
  value += state.dev_bought * (devCardVp(view) * WEIGHTS.vp + 1) * WEIGHTS.dev
  value += state.road_value
  return value
}

/** Every step available from `state`: builds and dev buys first, then bank trades that reach one. */
function steps(view, state, spots) {
  const { board, me } = view
  const out = []
  const afford = cost => canAfford(state.cards, cost)
  const pay = (cost) => { const cards = { ...state.cards }; Object.entries(cost).forEach(([r, n]) => { cards[r] -= n }); return cards }

  if (state.pieces.C.length < CONST.PIECES_COUNT.C && state.pieces.S.length && afford(CONST.COST.C)) {
    const loc = best(state.pieces.S, id => cornerPips(board.findCorner(id)))
    out.push({ intent: { type: 'build', piece: 'C', loc }, next: {
      ...state, cards: pay(CONST.COST.C), vp: state.vp + 1,
      pieces: { ...state.pieces, S: state.pieces.S.filter(id => id !== loc), C: [...state.pieces.C, loc] },
    } })
  }
  if (state.pieces.S.length < CONST.PIECES_COUNT.S && afford(CONST.COST.S)) {
    const free = spots.at.filter(id => !state.taken_spots.includes(id))
    ;[...free].sort((a, b) => cornerScore(board, board.findCorner(b), me) - cornerScore(board, board.findCorner(a), me))
      .slice(0, 3).forEach(loc => out.push({ intent: { type: 'build', piece: 'S', loc }, next: {
        ...state, cards: pay(CONST.COST.S), vp: state.vp + 1,
        pieces: { ...state.pieces, S: [...state.pieces.S, loc] }, taken_spots: [...state.taken_spots, loc],
      } }))
  }
  // Roads: toward Longest Road, or toward a spot when none is buildable yet
  if (state.pieces.R.length < CONST.PIECES_COUNT.R && afford(CONST.COST.R) && state.steps.length < 2) {
    const edges = board.getRoadLocationsFromRoads(state.pieces.R)
    const cur_len = longestRoadWith(board, view.pid, state.pieces.R)
    const holder = view.players.find(p => p.id === view.longest_road_pid)
    const to_beat = view.longest_road_pid === view.pid ? Infinity
      : holder ? holder.longest_road_list.length + 1 : view.config.longest_road_count
    const free_at = spots.at.filter(id => !state.taken_spots.includes(id))
    const gain = loc => {
      const len = longestRoadWith(board, view.pid, state.pieces.R, loc)
      let v = 0
      if (len >= to_beat) { v += 2 * WEIGHTS.vp }
      else if (len > cur_len && len >= 3) { v += (len - cur_len) * WEIGHTS.road_len * (to_beat === Infinity ? 0.3 : 1) }
      if (!free_at.length) {
        const after = reachableSpots(board, [...state.pieces.R, loc], view.pid)
        const opened = after.at.filter(id => !spots.at.includes(id))
        v += Math.max(0, ...opened.map(id => cornerScore(board, board.findCorner(id), me))) * WEIGHTS.road_open
      }
      return v
    }
    const loc = best(edges, gain)
    if (loc !== undefined && gain(loc) > 0) {
      out.push({ intent: { type: 'build', piece: 'R', loc }, next: {
        ...state, cards: pay(CONST.COST.R), road_value: state.road_value + gain(loc),
        pieces: { ...state.pieces, R: [...state.pieces.R, loc] },
      } })
    }
  }
  if (view.dev_cards_len > state.dev_bought && afford(CONST.COST.DEV_C)) {
    out.push({ intent: { type: 'buy_dev' }, next: { ...state, cards: pay(CONST.COST.DEV_C), dev_bought: state.dev_bought + 1 } })
  }
  if (view.state === CONST.GAME_STATES.SPECIAL_BUILD) return out // no trading in a building window
  // Bank trades: only for a card some build is short of, paid from a pile no build in reach needs
  const wanted = new Set()
  ;[CONST.COST.C, CONST.COST.S, CONST.COST.DEV_C, CONST.COST.R].forEach(cost => {
    const missing = missingFor(state.cards, cost)
    if (total(missing) >= 1 && total(missing) <= 2) { Object.keys(missing).forEach(r => wanted.add(r)) }
  })
  wanted.forEach(take => RES.forEach(give => {
    if (give === take) return
    const rate = bankRate(me, give)
    if (state.cards[give] < rate) return
    const cards = { ...state.cards, [give]: state.cards[give] - rate, [take]: state.cards[take] + 1 }
    out.push({ intent: { type: 'bank_trade', offer: bankType(me, give), giving: { [give]: rate }, taking: { [take]: 1 } }, next: { ...state, cards } })
  }))
  return out
}

/** Depth-first over ≤ PLAN_STEPS steps, ≤ PLAN_CAP plans; returns the best plan's first step. */
function plan(view) {
  const spots = reachableSpots(view.board, view.me.pieces.R, view.pid)
  const front = leader(view)
  const leader_spots = new Set(front ? (s => [...s.at, ...s.near])(reachableSpots(view.board, front.pieces.R, front.id)) : [])
  const value = state => stateValue(view, state, spots, leader_spots)
  const start = initial(view)
  let seen = 0
  let best_plan = { first: null, value: value(start) }
  const walk = (state, first, depth) => {
    if (seen++ > PLAN_CAP) return
    const v = value(state)
    // Plans that end on a trade are worth nothing until the build they were for lands
    if (first && state.steps.at(-1) !== 'bank_trade' && v > best_plan.value + 1e-9) { best_plan = { first, value: v } }
    if (depth >= PLAN_STEPS) return
    steps(view, state, spots).forEach(({ intent, next }) => {
      walk({ ...next, steps: [...state.steps, intent.type] }, first || intent, depth + 1)
    })
  }
  walk(start, null, 0)
  return best_plan
}

// ---------- Placement ----------

/** Medium's corner score plus what the first road can reach: a corner with room to grow. */
function placement(view, moves) {
  if (!WEIGHTS.expand) return mediumPlacement(view, moves)
  const { board, me } = view
  const corners = [...new Set(moves.map(m => m.settlement_loc))]
  const reach = corner => Math.max(0, ...corner.getEdges(-1).map(e => {
    const far = e.jumpCorner(corner)
    return Math.max(0, ...(far?.getEdges(-1) || []).map(e2 => e2.jumpCorner(far))
      .filter(c => c && c !== corner && !c.piece && c.hasNoNeighbours() && c.tiles.some(t => t.type !== 'S'))
      .map(c => cornerScore(board, c, me)))
  }))
  const loc = best(corners, id => cornerScore(board, board.findCorner(id), me) + WEIGHTS.expand * reach(board.findCorner(id)))
  const own = moves.filter(m => m.settlement_loc === loc)
  return mediumPlacement(view, own)
}

/** A knight every turn it is allowed: robs the leader and walks toward Largest Army. */
function knightFirst(view, moves) {
  if (!WEIGHTS.knight) return
  const knights = moves.filter(m => m.type === 'knight')
  if (!knights.length) return
  // Not the last knight before the deck is empty of VP... just play it: army and a steal both pay
  return robber(view, knights)
}

// ---------- Roads ----------

/** A road when it wins Longest Road now or brings a new spot within one step, and nothing better is affordable. */
function roadStep(view, moves) {
  const { board, me, pid } = view
  const roads = moves.filter(m => m.type === 'build' && m.piece === 'R')
  if (!roads.length) return
  const edges = roads.map(m => m.loc)
  const swing = longestRoadSwing(view, edges)
  if (swing !== undefined) return roads.find(m => m.loc === swing)
  const now = reachableSpots(board, me.pieces.R, pid)
  if (now.at.length) return // a spot is already buildable: save for the settlement
  if (me.pieces.S.length >= CONST.PIECES_COUNT.S) return
  const gain = loc => {
    const after = reachableSpots(board, [...me.pieces.R, loc], pid)
    const opened = after.at.filter(id => !now.at.includes(id))
    const nearer = after.near.filter(id => !now.near.includes(id) && !now.at.includes(id))
    return Math.max(0, ...opened.map(id => cornerScore(board, board.findCorner(id), me)),
      ...nearer.map(id => 0.5 * cornerScore(board, board.findCorner(id), me)))
  }
  const loc = best(edges, gain)
  return gain(loc) > 0 ? roads.find(m => m.loc === loc) : undefined
}

// ---------- Player trades ----------

/**
 * Ask when the best plan is exactly one card short and paying with surplus is cheaper than the
 * bank: 1:1 if the bank rate for the surplus is 4, 2:1 if it is 3 or the pile is deep.
 */
function proposal(view, moves) {
  const asks = moves.filter(m => m.type === 'player_trade')
  if (!asks.length || raceMode(view)) return
  const { me } = view
  const cards = me.closed_cards
  const targets = [CONST.COST.C, CONST.COST.S, CONST.COST.DEV_C]
  const needed = new Set(targets.flatMap(cost => Object.keys(cost)))
  // Surplus: beyond what the most expensive build using that resource wants
  const surplus = r => cards[r] - Math.max(0, ...targets.map(cost => cost[r] || 0))
  const others = view.players.filter(p => p.id !== view.pid && !p.removed)
  const likely = (pid, r) => view.counted?.likely(pid, r) ?? 1
  /**
   * Who would plausibly say yes: they are counted as holding the card, and the one offered brings
   * a build of theirs closer (the same rule medium answers by, run on their public position).
   */
  const takers = (give, take) => others.filter(p => likely(p.id, take) >= 0.5 && (!view.counted
    || [CONST.COST.C, CONST.COST.S, CONST.COST.DEV_C, CONST.COST.R].some(cost => (cost[give] || 0) > likely(p.id, give))))
  let pick = null
  targets.forEach(cost => {
    const need = missingFor(cards, cost)
    if (total(need) !== 1) return
    const take = Object.keys(need)[0]
    RES.filter(r => r !== take && surplus(r) >= 1 && bankRate(me, r) > 2).forEach(give => {
      const n = WEIGHTS.ask_two && (bankRate(me, give) === 3 || surplus(give) >= 3) ? 2 : 1
      const ask = asks.find(m => m.giving[give] === n && m.taking[take] === 1)
      if (!ask) return
      const score = takers(give, take).length * 10 + surplus(give)
      if (!pick || score > pick.score) { pick = { ask, score } }
    })
  })
  return pick && pick.score >= 10 ? pick.ask : undefined
}

// ---------- Robber, steal, answers ----------

function robber(view, moves) {
  const { board, pid } = view
  const front = leader(view)
  if (raceMode(view) && front) {
    const on_leader = moves.filter(m => m.stolen_pid === front.id)
    if (on_leader.length) return best(on_leader, m => pips(+board.findTile(m.tile_id).num))
  }
  if (!view.counted) return mediumRobber(view, moves)
  const cardsOf = p => RES.reduce((m, r) => m + view.counted.likely(p, r), 0)
  const tileScore = tile_id => {
    const tile = board.findTile(tile_id)
    let score = 0, mine = false
    tile.getAllCorners().forEach(c => {
      if (!c.piece) return
      if (c.player_id === pid) { mine = true; return }
      score += pips(+tile.num) * (c.piece === 'C' ? 2 : 1) * (c.player_id === front?.id ? 1.5 : 1)
    })
    return mine ? score - 100 : score
  }
  const tile_id = best([...new Set(moves.map(m => m.tile_id))], tileScore)
  const on_tile = moves.filter(m => m.tile_id === tile_id)
  return best(on_tile, m => m.stolen_pid ? cardsOf(m.stolen_pid) + (m.stolen_pid === front?.id ? 0.5 : 0) : 0)
}

function answer(view, moves) {
  const base = tradeAnswer(view, moves)
  if (!base?.accepted || !view.counted) return base
  const trade = view.ongoing_trades.find(t => t.id === base.id)
  const giver = view.players.find(p => p.id === trade.pid)
  if (!giver) return base
  // The asked card completes a build that would put the giver over the line: refuse
  const short = cost => RES.reduce((m, r) => m + Math.max(0, (cost[r] || 0) - view.counted.likely(giver.id, r)), 0)
  const asked = Object.keys(trade.asking)
  const winning = [CONST.COST.C, CONST.COST.S].some(cost =>
    asked.some(r => cost[r]) && short(cost) <= total(trade.asking) && giver.public_vps + 1 >= view.config.win_points - 1)
  return winning ? moves.find(m => !m.accepted) : base
}

// ---------- Entry ----------

/**
 * @param {ReturnType<import('./view.js').buildView>} view
 * @param {object[]} moves legal intents from `legalMoves`
 * @returns {object} one intent
 */
export function evaluate(view, moves) {
  switch (moves[0]?.type) {
    case 'initial_build': return placement(view, moves)
    case 'discard': return discard(view, moves[0])
    case 'robber': return robber(view, moves)
    case 'trade_response': return answer(view, moves)
  }
  const play = knightFirst(view, moves) || devCardPlay(view, moves)
  if (play) return play
  const ST = CONST.GAME_STATES
  if (view.state !== ST.PLAYER_ACTIONS && view.state !== ST.SPECIAL_BUILD) return moves.find(m => m.type === 'roll')

  const chosen = plan(view)
  if (chosen.first) {
    // Rather than paying the bank, ask the table when it is cheaper and allowed
    if (chosen.first.type === 'bank_trade') {
      const ask = proposal(view, moves)
      if (ask) return ask
    }
    return chosen.first
  }
  const road = roadStep(view, moves)
  if (road) return road
  const ask = proposal(view, moves)
  if (ask) return ask
  return moves.find(m => m.type === 'end_turn')
}
