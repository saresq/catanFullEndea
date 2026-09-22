// Easy: random legal play. It builds or buys whenever it can afford something, keeps the robber
// off tiles where it sits alone, and takes an affordable trade about six times in ten.
import { victimsOn } from './moves.js'

const pick = list => list[Math.floor(Math.random() * list.length)]
const BUILD_WEIGHT = { C: 4, S: 4, R: 2, DEV_C: 2 }

function weightedPick(groups) {
  const entries = Object.entries(groups)
  let roll = Math.random() * entries.reduce((m, [k]) => m + BUILD_WEIGHT[k], 0)
  for (const [k, list] of entries) {
    roll -= BUILD_WEIGHT[k]
    if (roll <= 0) return pick(list)
  }
  return pick(entries[0][1])
}

/** Tiles where this seat has a building and no opponent does. */
function sitsAlone(view, tile_id) {
  const mine = view.board.findTile(tile_id)?.getAllCorners().some(c => c.piece && c.player_id === view.pid)
  return mine && !victimsOn(view.board, tile_id, view.pid).length
}

function robberChoice(view, intents) {
  const fair = intents.filter(i => !sitsAlone(view, i.tile_id))
  return pick(fair.length ? fair : intents)
}

/**
 * @param {ReturnType<import('./view.js').buildView>} view
 * @param {object[]} moves legal intents from `legalMoves`
 * @returns {object} one intent
 */
export function evaluate(view, moves) {
  const first = moves[0]?.type
  if (first === 'robber') return robberChoice(view, moves)
  if (first === 'trade_response') {
    const accept = moves.find(m => m.accepted)
    return accept && Math.random() < 0.6 ? accept : moves.find(m => !m.accepted)
  }
  if (first === 'initial_build' || first === 'discard') return pick(moves)

  // A knight only to get the robber off its own tile
  const robbed = view.board.getRobbedTile()?.getAllCorners().some(c => c.piece && c.player_id === view.pid)
  const knights = moves.filter(m => m.type === 'knight')
  if (robbed && knights.length) return robberChoice(view, knights)
  if (first === 'roll') return moves[0]

  // Actions: anything affordable gets built or bought
  const builds = {}
  moves.forEach(m => {
    const key = m.type === 'build' ? m.piece : m.type === 'buy_dev' ? 'DEV_C' : null
    if (key) { (builds[key] = builds[key] || []).push(m) }
  })
  if (Object.keys(builds).length) return weightedPick(builds)

  const powers = moves.filter(m => ['road_building', 'year_of_plenty', 'monopoly'].includes(m.type))
  if (powers.length && Math.random() < 0.5) return pick(powers)
  const bank = moves.filter(m => m.type === 'bank_trade')
  if (bank.length && Math.random() < 0.25) return pick(bank)
  return moves.find(m => m.type === 'end_turn')
}
