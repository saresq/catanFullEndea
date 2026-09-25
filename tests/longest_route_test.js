// Longest Route: first to five takes it, only a strictly longer route takes it away, and a
// settlement that breaks the holder's route returns it - to nobody, to the single longest, or
// back later. Every player's length is kept current, so a stale length never wins.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { playToFirstRoll } from './helpers.js'

const SOC = CONST.SOCKET_EVENTS
const MIN = CONST.GAME_CONFIG.longest_road_count

/** A 3-player game on the standard map, placed deterministically, every award broadcast recorded. */
function newGame() {
  const events = []
  const io = { to: () => ({ emit: (...args) => events.push(args) }) }
  const game = new Game({
    id: 'route', io, host: { id: 1, name: 'P1' },
    config: { player_count: 3, timer: false, map_shuffle: 'none' }, onGameEnd: () => {},
  })
  game.join('P2'); game.join('P3')
  game.start()
  // Same corners every run, spread down the board so nobody is boxed in: the k-th placement
  // takes the legal corner k sixths along the list, and its first legal edge
  game.players.forEach(p => { game.dice = { roll: () => ({ d1: p.id === 1 ? 6 : 1, d2: p.id === 1 ? 6 : 1 }) }; game.playerRollIO(p.id) })
  for (let k = 0; game.state === CONST.GAME_STATES.INITIAL_SETUP && k < 20; k++) {
    const corners = game.board.getSettlementLocations(-1)
    const corner = corners[Math.floor(k * corners.length / 6)]
    const edge = corner.getEdges(-1).find(e => !e.corner1.surroundedBySea() && !e.corner2.surroundedBySea())
    game.initialBuildIO(game.active_pid, corner.id, edge.id)
  }
  return { game, events }
}

const len = (game, pid) => game.getPlayer(pid).longest_road_list.length
const holder = game => game.longest_road_pid
const vps = (game, pid) => game.getPlayer(pid).public_vps

/**
 * `n` free edges continuing `pid`'s route from one of its ends, found by search: each new corner
 * is empty, off the player's other roads and on land, so every road lengthens the route by one.
 */
function chain(game, pid, n) {
  const board = game.board
  const player = game.getPlayer(pid)
  const mine = new Set(player.pieces.R.flatMap(id => [board.findEdge(id).corner1.id, board.findEdge(id).corner2.id]))
  const route = player.longest_road_list.map(id => board.findEdge(id))
  const endOf = (edge, next) => next ? [edge.corner1, edge.corner2].find(c => c !== next.corner1 && c !== next.corner2) : null
  const ends = route.length === 1 ? [route[0].corner1, route[0].corner2]
    : [endOf(route.at(-1), route.at(-2)), endOf(route[0], route[1])]
  const walk = (corner, taken) => {
    if (taken.length === n) return taken
    for (const edge of corner.getEdges(-1)) {
      const far = edge.jumpCorner(corner)
      if (far.piece || mine.has(far.id) || far.surroundedBySea() || taken.some(t => t.far === far)) continue
      const found = walk(far, [...taken, { edge, far }])
      if (found) return found
    }
    return null
  }
  for (const end of ends) {
    if (end.piece && end.player_id !== pid) continue
    const found = walk(end, [])
    if (found) return found.map(t => t.edge.id)
  }
  assert.fail(`no room for ${n} more roads on player ${pid}'s route`)
}

/** Build roads for `pid` until its route is `target` long (placed straight on the board). */
function growTo(game, pid, target) {
  const before = len(game, pid)
  chain(game, pid, target - before).forEach((loc, i) => {
    game.build(pid, 'R', loc)
    assert.equal(len(game, pid), before + i + 1)
  })
}

/** Corner between the `i`th and `i+1`th road of `pid`'s route, and its settlement there by `breaker`. */
function breakAt(game, pid, i, breaker) {
  const route = game.getPlayer(pid).longest_road_list
  const e1 = game.board.findEdge(route[i]), e2 = game.board.findEdge(route[i + 1])
  const corner = [e1.corner1, e1.corner2].find(c => c === e2.corner1 || c === e2.corner2)
  assert.ok(corner && !corner.piece, 'the route passes an empty corner there')
  game.build(breaker, 'S', corner.id)
}

const awards = events => events.filter(([e]) => e === SOC.LONGEST_ROAD).map(([, pid, locs]) => [pid, locs.length])

test('first to five takes it; equal length does not take it; longer does', () => {
  const { game, events } = newGame()
  growTo(game, 1, MIN - 1)
  assert.equal(holder(game), -1, 'four roads: nothing yet')
  growTo(game, 1, MIN)
  assert.equal(holder(game), 1)
  assert.equal(vps(game, 1), 4, 'two settlements and the award')
  growTo(game, 1, 6)
  growTo(game, 2, 6)
  assert.equal(holder(game), 1, 'equal length does not take it')
  growTo(game, 2, 7)
  assert.equal(holder(game), 2, 'longer takes it')
  assert.deepEqual([vps(game, 1), vps(game, 2)], [2, 4])
  assert.deepEqual(awards(events), [[1, 5], [2, 7]])
})

test('broken below five: the award and its points return, nobody holds it', () => {
  const { game, events } = newGame()
  growTo(game, 1, 7)
  assert.equal(holder(game), 1)
  breakAt(game, 1, 3, 2) // 4 and 3
  assert.equal(len(game, 1), 4)
  assert.equal(holder(game), -1)
  assert.equal(vps(game, 1), 2)
  assert.deepEqual(awards(events).at(-1), [1, 0], 'the loss is announced')
})

test('broken but still the single longest: the holder keeps it', () => {
  const { game } = newGame()
  growTo(game, 1, 9)
  growTo(game, 2, 5)
  assert.equal(holder(game), 1)
  breakAt(game, 1, 5, 3) // 6 and 3
  assert.equal(len(game, 1), 6)
  assert.equal(holder(game), 1)
  assert.equal(vps(game, 1), 4)
})

test('broken into a tie: nobody holds it', () => {
  const { game } = newGame()
  growTo(game, 1, 9)
  growTo(game, 2, 5)
  breakAt(game, 1, 4, 3) // 5 and 4
  assert.equal(len(game, 1), 5)
  assert.equal(holder(game), -1)
  assert.deepEqual([vps(game, 1), vps(game, 2)], [2, 2])
})

test('broken while another player is longest: they receive it during the breaker\'s turn', () => {
  const { game, events } = newGame()
  growTo(game, 1, 7)
  growTo(game, 3, 6)
  assert.equal(holder(game), 1)
  breakAt(game, 1, 3, 2) // 4 and 3
  assert.equal(holder(game), 3)
  assert.deepEqual([vps(game, 1), vps(game, 3)], [2, 4])
  assert.deepEqual(awards(events).slice(-2), [[1, 0], [3, 6]])
})

test('a non-holder\'s stale length cannot win later', () => {
  const { game } = newGame()
  growTo(game, 1, 7) // the holder
  growTo(game, 3, 6)
  breakAt(game, 3, 2, 2) // player 3: 3 and 3, kept current from that moment
  assert.equal(len(game, 3), 3)
  assert.equal(holder(game), 1)
  breakAt(game, 1, 3, 2) // now the holder: 4 and 3
  assert.equal(holder(game), -1, 'player 3\'s old six does not count')
})

test('re-awarded once a tie is resolved by a break', () => {
  const { game } = newGame()
  growTo(game, 1, 9)
  growTo(game, 2, 5)
  breakAt(game, 1, 4, 3) // 5 and 4: a tie, nobody
  assert.equal(holder(game), -1)
  breakAt(game, 2, 2, 3) // player 2: 3 and 2, so player 1 is the single longest at five
  assert.equal(holder(game), 1)
  assert.equal(vps(game, 1), 4)
})

test('re-awarded once a tie is resolved by a road', () => {
  const { game } = newGame()
  growTo(game, 1, 9)
  growTo(game, 2, 5)
  breakAt(game, 1, 4, 3) // 5 and 4: a tie, nobody
  assert.equal(holder(game), -1)
  growTo(game, 2, 6)
  assert.equal(holder(game), 2)
  assert.equal(vps(game, 2), 4)
})
