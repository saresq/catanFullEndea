// Where the robber goes and whom it robs, on a fixed board. Medium and tryhard share the tile:
// the one that costs the table most, each building weighted by how far ahead its owner is, never
// its own while another exists. The victim: the leader in a race, else the fullest hand (medium)
// or the hand the count says holds what the bot is short of (tryhard).
import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate as medium } from '../models/bots/medium.js'
import { evaluate as tryhard, WEIGHTS } from '../models/bots/tryhard.js'
import { buildView } from '../models/bots/view.js'
import { legalMoves } from '../models/bots/moves.js'
import Tracker from '../models/bots/tracker.js'
import * as CONST from '../public/js/const.js'
import { botLobby, placeOn, setHand } from './bot_helpers.js'
import { rollOff } from './helpers.js'

const ST = CONST.GAME_STATES
// The 6 and the 8 are worth the same and share no corner with each other
const FIXTURE = 'S.S.S.S-S.F6.G8.S+S.C5.M2.J11.S-S.F3.G12.S+S.S.S.S'

/**
 * Three seats placed by hand (order 1, 2, 3, 3, 2, 1): seat 1 on the 12 and the 3, seat 2 alone
 * on the 6, seat 3 alone on the 8, both second settlements on the 11 (`shared`) or apart.
 */
function seated({ shared = false } = {}) {
  const { game } = botLobby({ humans: 3, config: { player_count: 3, mapkey: FIXTURE, map_shuffle: 'none' } })
  game.start()
  rollOff(game)
  const corners = {}
  corners.mine = placeOn(game, [12], [5, 3, 2])
  corners.six = placeOn(game, [6], [8, 5])
  corners.eight = placeOn(game, [8], [6, 5, 2])
  placeOn(game, [11], [2])
  shared ? placeOn(game, [11], [2]) : placeOn(game, [3], [5, 12])
  placeOn(game, [3], [5, 12])
  assert.equal(game.state, ST.PLAYER_ROLL)
  return { game, corners }
}
const numOf = (game, tile_id) => +game.board.findTile(tile_id).num
const tileOf = (game, num) => game.board.findTile(game.board.getRobbableTiles().find(id => numOf(game, id) === num))
const robberMoves = (game, pid = 1) => {
  const view = buildView(game, pid)
  return { view, moves: legalMoves(view, ST.ROBBER_MOVE) }
}

for (const [name, evaluate] of [['medium', medium], ['tryhard', tryhard]]) {
  test(`${name}: level on points, the tile of the seat further ahead goes`, () => {
    const { game } = seated()
    game.getPlayer(3).public_vps = 7
    let { view, moves } = robberMoves(game)
    assert.equal(numOf(game, evaluate(view, moves).tile_id), 8)
    game.getPlayer(3).public_vps = 2
    game.getPlayer(2).public_vps = 7
    ;({ view, moves } = robberMoves(game))
    assert.equal(numOf(game, evaluate(view, moves).tile_id), 6)
    game.clearTimer()
  })

  test(`${name}: a city on the tile counts double`, () => {
    const { game, corners } = seated()
    game.build(2, 'C', corners.six)
    const { view, moves } = robberMoves(game)
    assert.equal(numOf(game, evaluate(view, moves).tile_id), 6)
    game.clearTimer()
  })

  test(`${name}: never its own tile while another exists`, () => {
    const { game, corners } = seated()
    game.getPlayer(3).public_vps = 7
    game.build(3, 'C', corners.eight)
    // Seat 1 moves onto the 8 as well: the juiciest tile is now off limits
    game.build(1, 'S', tileOf(game, 8).getAllCorners().find(c => !c.piece && c.hasNoNeighbours()).id)
    const { view, moves } = robberMoves(game)
    const choice = evaluate(view, moves)
    assert.notEqual(numOf(game, choice.tile_id), 8)
    assert.ok(!game.board.findTile(choice.tile_id).getAllCorners().some(c => c.player_id === 1))
    game.clearTimer()
  })

  test(`${name}: in a race the leader is robbed, on one of their tiles`, () => {
    const { game } = seated()
    game.getPlayer(3).public_vps = game.config.win_points - 2
    setHand(game.getPlayer(2), { L: 5 })
    setHand(game.getPlayer(3), { O: 1 })
    const { view, moves } = robberMoves(game)
    const choice = evaluate(view, moves)
    assert.equal(choice.stolen_pid, 3)
    assert.ok(game.board.findTile(choice.tile_id).getAllCorners().some(c => c.player_id === 3))
    game.clearTimer()
  })
}
test('tryhard: the robber turns on the leader further out than medium\'s does', () => {
  assert.ok(WEIGHTS.rob_race > 2)
  const { game } = seated()
  game.getPlayer(3).public_vps = game.config.win_points - WEIGHTS.rob_race
  game.build(2, 'C', game.getPlayer(2).pieces.S[0]) // seat 2 is the bigger producer
  setHand(game.getPlayer(2), { L: 5 })
  setHand(game.getPlayer(3), { O: 1 })
  const { view, moves } = robberMoves(game)
  const choice = tryhard(view, moves)
  assert.equal(choice.stolen_pid, 3)
  assert.ok(game.board.findTile(choice.tile_id).getAllCorners().some(c => c.player_id === 3))
  assert.equal(numOf(game, medium(view, moves).tile_id), 6) // medium still blocks the producer
  game.clearTimer()
})

test('medium: robs the leader on the tile when they hold cards, else the fullest hand', () => {
  const { game } = seated({ shared: true })
  const on11 = moves => moves.filter(m => numOf(game, m.tile_id) === 11)
  game.getPlayer(3).public_vps = 3 // the leader, one point up
  setHand(game.getPlayer(2), { L: 4 })
  setHand(game.getPlayer(3), { O: 1 })
  let { view, moves } = robberMoves(game)
  assert.equal(medium(view, on11(moves)).stolen_pid, 3)
  setHand(game.getPlayer(3), {})
  ;({ view, moves } = robberMoves(game))
  assert.equal(medium(view, on11(moves)).stolen_pid, 2)
  game.clearTimer()
})

test('tryhard: the victim follows the count, and a card it is short of counts double', () => {
  const { game } = seated({ shared: true })
  const on11 = moves => moves.filter(m => numOf(game, m.tile_id) === 11)
  const counted = (view, payout) => {
    const tracker = new Tracker()
    tracker.observe({ type: 'roll', total: 5, payout })
    view.counted = tracker.snapshot()
    return view
  }
  // Seat 2 counted with three cards, seat 3 with none
  setHand(game.getPlayer(2), { L: 3 })
  let { view, moves } = robberMoves(game)
  assert.equal(tryhard(counted(view, [{ pid: 2, res: { L: 3 } }]), on11(moves)).stolen_pid, 2)
  // Seat 1 is one ore short of a city: seat 3's two ore beat seat 2's three lumber
  setHand(game.getPlayer(1), { W: 2, O: 2 })
  setHand(game.getPlayer(3), { O: 2 })
  ;({ view, moves } = robberMoves(game))
  assert.equal(tryhard(counted(view, [{ pid: 2, res: { L: 3 } }, { pid: 3, res: { O: 2 } }]), on11(moves)).stolen_pid, 3)
  game.clearTimer()
})
