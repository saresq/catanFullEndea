// A road only goes on an edge reached through a corner the builder controls: empty, or holding
// their own building. Another player's settlement blocks the corner - for building, for Road
// Building and for the bots' choice of road.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { legalMoves, KINDS } from '../models/bots/moves.js'
import { buildView } from '../models/bots/view.js'
import { rollOff } from './helpers.js'

const ST = CONST.GAME_STATES
const io = { to: () => ({ emit: () => {} }) }

/**
 * A 3-player game in PLAYER_ACTIONS on the standard map, seat 1 active with a rich hand. Placed
 * the same way every run, spread down the board: the k-th placement takes the legal corner k
 * sixths along the list and its first legal edge.
 */
function playingGame() {
  const game = new Game({
    id: 'road-placement', io, host: { id: 1, name: 'P1' },
    config: { player_count: 3, timer: false, map_shuffle: 'none' }, onGameEnd: () => {},
  })
  game.join('P2'); game.join('P3')
  game.start()
  rollOff(game)
  for (let k = 0; game.state === ST.INITIAL_SETUP && k < 20; k++) {
    const corners = game.board.getSettlementLocations(-1)
    const corner = corners[Math.floor(k * corners.length / 6)]
    const edge = corner.getEdges(-1).find(e => !e.corner1.surroundedBySea() && !e.corner2.surroundedBySea())
    game.initialBuildIO(game.active_pid, corner.id, edge.id)
  }
  game.dice = { roll: () => ({ d1: 3, d2: 3 }) }
  game.playerRollIO(1)
  assert.equal(game.state, ST.PLAYER_ACTIONS)
  game.getPlayer(1).giveCards({ L: 5, B: 5 })
  return game
}

/** Free edges at a corner that a road may take: not into the sea. */
const landEdges = corner => corner.getEdges(-1).filter(e => !e.corner1.surroundedBySea() && !e.corner2.surroundedBySea())

/**
 * The corner at the far end of one of `pid`'s initial roads: empty, with two free land edges
 * beyond it, each leading to a corner with a free land edge of its own.
 */
function roadEnd(game, pid) {
  const player = game.getPlayer(pid)
  for (const loc of player.pieces.R) {
    const edge = game.board.findEdge(loc)
    const far = player.pieces.S.includes(edge.corner1.id) ? edge.corner2 : edge.corner1
    const beyond = landEdges(far)
    if (!far.piece && beyond.length === 2 && beyond.every(e => landEdges(e.jumpCorner(far)).length)) return { edge, far }
  }
  assert.fail('no road with a free far corner')
}

test('an opponent\'s settlement blocks the corner; the own settlement does not', () => {
  const game = playingGame()
  const { edge, far } = roadEnd(game, 1)
  const beyond = landEdges(far).map(e => e.id)
  const before = game.board.getRoadLocationsFromRoads(game.getPlayer(1).pieces.R, 1)
  assert.ok(beyond.every(id => before.includes(id)), 'open corner: both edges offered')

  game.build(2, 'S', far.id) // placed straight on the board: the block is what is under test
  const after = game.board.getRoadLocationsFromRoads(game.getPlayer(1).pieces.R, 1)
  assert.ok(beyond.every(id => !after.includes(id)), 'blocked corner: neither edge offered')
  assert.ok(after.length > 0, 'the other corners still offer edges')

  // The own settlement's corner keeps offering its free edges
  const own = game.board.findCorner(game.getPlayer(1).pieces.S[0])
  const own_edges = landEdges(own).map(e => e.id)
  assert.ok(own_edges.length && own_edges.every(id => after.includes(id)))
  void edge
})

test('reached from the other side: nothing new at the blocked corner, the far ends still extend', () => {
  const game = playingGame()
  const p1 = game.getPlayer(1)
  const { far } = roadEnd(game, 1)
  const [next] = landEdges(far)
  game.build(1, 'R', next.id) // roads on both sides of `far`
  const other = next.jumpCorner(far)
  game.build(2, 'S', far.id)
  const offered = game.board.getRoadLocationsFromRoads(p1.pieces.R, 1)
  assert.ok(far.getEdges(-1).every(e => !offered.includes(e.id)), 'no edge through the settlement')
  assert.ok(landEdges(other).some(e => offered.includes(e.id)), 'the new road extends at its far corner')
})

test('a client sending a blocked edge builds nothing and spends nothing', () => {
  const game = playingGame()
  const p1 = game.getPlayer(1)
  const { far } = roadEnd(game, 1)
  const [blocked] = landEdges(far)
  game.build(2, 'S', far.id)
  const roads = p1.pieces.R.length, lumber = p1.closed_cards.L
  game.clickedLocationIO(1, CONST.LOCS.EDGE, blocked.id)
  assert.equal(p1.pieces.R.length, roads)
  assert.equal(p1.closed_cards.L, lumber)
  assert.equal(game.board.findEdge(blocked.id).road, undefined)
})

test('Road Building with only blocked edges keeps the card', () => {
  const game = playingGame()
  const p1 = game.getPlayer(1)
  // One road whose both corners hold opponents' settlements: nowhere legal past them
  const { edge, far } = roadEnd(game, 1)
  const near = edge.jumpCorner(far)
  p1.pieces.R = [edge.id]
  p1.pieces.S = []
  game.board.findCorner(near.id).piece = undefined; game.board.findCorner(near.id).player_id = undefined
  game.build(2, 'S', far.id)
  game.build(3, 'S', near.id)
  p1.giveCards({ dR: 1 })
  p1.resetDevCard(true)
  game.roadBuildingIO(1)
  assert.equal(p1.pieces.R.length, 1, 'nothing built')
  assert.equal(p1.closed_cards.dR, 1, 'card kept')
})

test('the bots\' road moves respect the block', () => {
  const game = playingGame()
  const { far } = roadEnd(game, 1)
  const beyond = landEdges(far).map(e => e.id)
  game.build(2, 'S', far.id)
  const moves = legalMoves(buildView(game, 1), KINDS.PLAYER_ACTIONS)
  const roads = moves.filter(m => m.type === 'build' && m.piece === 'R').map(m => m.loc)
  assert.ok(roads.length, 'roads on offer')
  assert.ok(beyond.every(id => !roads.includes(id)), 'none through the settlement')
})
