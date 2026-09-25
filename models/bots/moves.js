import * as CONST from '../../public/js/const.js'

const ST = CONST.GAME_STATES
const RES = Object.keys(CONST.RESOURCES)

/** Expectation kinds a bot can be asked for: the game states plus a trade to answer. */
export const KINDS = { ...ST, TRADE_REQ: 'TRADE_REQ' }

export const canAfford = (cards, cost) => Object.entries(cost).every(([k, v]) => (cards[k] || 0) >= v)

/** What the player may buy right now: cards in hand and pieces left in the box. */
export function canBuy(me, type) {
  if (CONST.PIECES[type] && CONST.PIECES_COUNT[type] <= me.pieces[type].length) return false
  return canAfford(me.closed_cards, CONST.COST[type])
}

export function canPlayDevCard(me, type) {
  return !!me.can_play_dc && me.closed_cards[type] > (me.turn_bought_dc?.[type] || 0)
}

/** Whether the bank holds every card in `cards` */
export const bankHas = (bank, cards) => Object.entries(cards).every(([res, n]) => (bank?.[res] ?? 0) >= n)

/** Best bank rate the player owns for giving `res`: 2, 3 or 4. */
export function bankRate(me, res) {
  if (me.trade_offers[res + '2']) return 2
  return me.trade_offers['*3'] ? 3 : 4
}
export const bankType = (me, res) => ({ 2: res + '2', 3: '*3', 4: '*4' })[bankRate(me, res)]

/** Opponents with a building on the tile - the players a robber there can steal from. */
export function victimsOn(board, tile_id, pid) {
  const pids = board.findTile(tile_id)?.getAllCorners()
    .filter(c => c.piece && c.player_id !== pid).map(c => c.player_id) || []
  return [...new Set(pids)]
}

/** One intent per robbable tile and victim on it (or a single one with nobody to steal from). */
function robberIntents(view, type) {
  return view.board.getRobbableTiles().flatMap(tile_id => {
    const victims = victimsOn(view.board, tile_id, view.pid)
    return victims.length
      ? victims.map(stolen_pid => ({ type, tile_id, stolen_pid }))
      : [{ type, tile_id }]
  })
}

function devCardIntents(view) {
  const { me, board } = view
  const intents = []
  if (canPlayDevCard(me, 'dK')) { intents.push(...robberIntents(view, 'knight')) }
  // Road Building builds what is left, one road with the last piece
  if (canPlayDevCard(me, 'dR') && CONST.PIECES_COUNT.R - me.pieces.R.length >= 1) {
    // `r2` is the evaluator's to fill: it depends on `r1`. Left empty the server picks one.
    board.getRoadLocationsFromRoads(me.pieces.R, view.pid).forEach(r1 => intents.push({ type: 'road_building', r1 }))
  }
  if (canPlayDevCard(me, 'dY')) {
    // Only pairs the bank holds; with one card in the whole bank any ask takes it, with none no play
    const stock = Object.values(view.bank || {}).reduce((m, v) => m + v, 0)
    RES.forEach((res1, i) => RES.slice(i).forEach(res2 => {
      const pair = res1 === res2 ? { [res1]: 2 } : { [res1]: 1, [res2]: 1 }
      if (stock === 1 || bankHas(view.bank, pair)) { intents.push({ type: 'year_of_plenty', res1, res2 }) }
    }))
  }
  if (canPlayDevCard(me, 'dM')) { RES.forEach(res => intents.push({ type: 'monopoly', res })) }
  return intents
}

/**
 * Player trade asks: one card wanted, paid with one or two cards of another resource. Templates
 * only - the evaluator decides which (if any) is worth asking; a refused pair is left out.
 */
function playerTradeIntents(view, refused) {
  const { me } = view
  const intents = []
  if (view.ongoing_trades.some(t => t.pid === view.pid && t.status === 'open')) return intents
  RES.forEach(take => RES.forEach(give => {
    if (give === take) return
    ;[1, 2].forEach(n => {
      if (me.closed_cards[give] < n) return
      const giving = { [give]: n }, taking = { [take]: 1 }
      if (refused?.has(JSON.stringify([giving, taking]))) return
      intents.push({ type: 'player_trade', giving, taking })
    })
  }))
  return intents
}

/** Builds and a development card purchase the player can pay for now */
function buildIntents(view) {
  const { me, board } = view
  const intents = []
  if (canBuy(me, 'C')) { me.pieces.S.forEach(loc => intents.push({ type: 'build', piece: 'C', loc })) }
  if (canBuy(me, 'S')) {
    board.getSettlementLocationsFromRoads(me.pieces.R).forEach(loc => intents.push({ type: 'build', piece: 'S', loc }))
  }
  if (canBuy(me, 'R')) {
    board.getRoadLocationsFromRoads(me.pieces.R, view.pid).forEach(loc => intents.push({ type: 'build', piece: 'R', loc }))
  }
  if (view.dev_cards_len && canBuy(me, 'DEV_C')) { intents.push({ type: 'buy_dev' }) }
  return intents
}

function actionIntents(view, extra = {}) {
  const { me } = view
  const intents = buildIntents(view)
  // Bank and port trades, one card at a time at the best rate owned, for what the bank holds
  RES.forEach(give => {
    const rate = bankRate(me, give)
    if (me.closed_cards[give] < rate) return
    RES.filter(take => take !== give && bankHas(view.bank, { [take]: 1 })).forEach(take => intents.push({
      type: 'bank_trade', offer: bankType(me, give), giving: { [give]: rate }, taking: { [take]: 1 },
    }))
  })
  intents.push(...devCardIntents(view))
  if (extra.can_propose) { intents.push(...playerTradeIntents(view, extra.refused)) }
  intents.push({ type: 'end_turn' })
  return intents
}

/**
 * Every legal intent for what the seat is being asked. Some are templates the evaluator completes
 * (`discard.resources`, `road_building.r2`); whatever comes back still goes through the same
 * `*IO` validation as a human's click, so a wrong intent is refused, never trusted.
 *
 * @param {ReturnType<import('./view.js').buildView>} view
 * @param {string} kind one of KINDS
 * @param {{ trade_id?: number, drop_count?: number, can_propose?: boolean, refused?: Set<string> }} [extra]
 *   `can_propose`: the bot may open a player trade this tick; `refused`: asks turned down this turn
 */
export function legalMoves(view, kind, extra = {}) {
  const { me, board } = view
  switch (kind) {
    case KINDS.INITIAL_SETUP:
      return board.getSettlementLocations(-1).flatMap(corner =>
        corner.getEdges(-1)
          .filter(e => !e.corner1.surroundedBySea() && !e.corner2.surroundedBySea())
          .map(e => ({ type: 'initial_build', settlement_loc: corner.id, road_loc: e.id })))

    case KINDS.FIRST_ROLL:
      return [{ type: 'roll' }]

    case KINDS.PLAYER_ROLL:
      return [{ type: 'roll' }, ...devCardIntents(view)]

    case KINDS.PLAYER_ACTIONS:
      return actionIntents(view, extra)

    // A paired action phase: everything of an actions phase but a player trade request
    case KINDS.PAIRED_ACTIONS:
      return actionIntents(view, { ...extra, can_propose: false })

    case KINDS.ROBBER_DROP:
      return [{ type: 'discard', count: extra.drop_count ?? Math.floor(me.resource_count / 2), resources: {} }]

    case KINDS.ROBBER_MOVE:
      return robberIntents(view, 'robber')

    case KINDS.TRADE_REQ: {
      const trade = view.ongoing_trades.find(t => t.id === extra.trade_id)
      if (!trade || trade.status !== 'open') return []
      const reject = { type: 'trade_response', id: trade.id, accepted: false }
      // The requester asks for what this seat would give
      return canAfford(me.closed_cards, trade.asking)
        ? [{ type: 'trade_response', id: trade.id, accepted: true }, reject]
        : [reject]
    }
  }
  return []
}
