// Headless smoke test: drives Game with a fake io, no socket.io, no express.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'

const ST = CONST.GAME_STATES
const fakeIo = { to: () => ({ emit: () => {} }) }
const tick = ms => new Promise(r => setTimeout(r, ms))

function newGame(config = {}) {
  return new Game({
    id: 'smoke', io: fakeIo,
    host: { id: 1, name: 'Alice' },
    config: { player_count: 3, timer: false, ...config },
    onGameEnd: () => {},
  })
}

test('full game flow', async t => {
  const game = newGame()

  await t.test('join + start', () => {
    assert.equal(game.join('Bob').id, 2)
    assert.equal(game.join('Cleo').id, 3)
    assert.equal(game.join('Nobody'), undefined, 'room is full')
    assert.deepEqual(game.players.map(p => p.name), ['Alice', 'Bob', 'Cleo'])
    assert.equal(game.config.win_points, 10)
    assert.equal(game.config.robber_hand_limit, 7)

    game.start()
    assert.equal(game.state, ST.INITIAL_SETUP)
    assert.ok(game.board, 'board built from mapkey')
  })

  await t.test('initial placement', () => {
    let guard = 0
    while (game.state === ST.INITIAL_SETUP && guard++ < 20) {
      game.initialBuildIO(game.active_pid) // no locs -> server picks a valid random one
    }
    assert.equal(game.state, ST.PLAYER_ROLL)
    assert.equal(game.turn, 3)
    assert.deepEqual(game.players.map(p => p.pieces.S.length), [2, 2, 2])
    assert.deepEqual(game.players.map(p => p.pieces.R.length), [2, 2, 2])
    // Second settlement pays out: at most one card per adjacent tile, and a corner
    // touching only desert/sea legitimately pays nothing
    game.players.forEach(p => assert.ok(p.resource_count <= 3, `p${p.id} got at most 3 starting cards`))
    const total_cards = game.players.reduce((sum, p) => sum + p.resource_count, 0)
    assert.ok(total_cards > 0, 'somebody got starting cards')
  })

  await t.test('roll dice', () => {
    game.playerRollIO()
    const [d1, d2] = game.dice_value
    assert.ok(d1 >= 1 && d1 <= 6 && d2 >= 1 && d2 <= 6, `dice in range: ${d1},${d2}`)
    assert.notEqual(d1 + d2, 7, 'first round is protected from 7')
    assert.equal(game.state, ST.PLAYER_ACTIONS)
  })

  await t.test('build a road', () => {
    const player = game.getActivePlayer()
    player.giveCards({ L: 1, B: 1 })
    const before = { roads: player.pieces.R.length, L: player.closed_cards.L, B: player.closed_cards.B }
    const loc = game.board.getRoadLocationsFromRoads(player.pieces.R)[0]

    game.clickedLocationIO(player.id, CONST.LOCS.EDGE, loc)
    assert.equal(player.pieces.R.length, before.roads + 1)
    assert.equal(player.closed_cards.L, before.L - 1)
    assert.equal(player.closed_cards.B, before.B - 1)

    game.clickedLocationIO(player.id, CONST.LOCS.EDGE, loc) // already taken + no cards left
    assert.equal(player.pieces.R.length, before.roads + 1, 'duplicate build rejected')
  })

  await t.test('trade with the bank', () => {
    const player = game.getActivePlayer()
    player.giveCards({ L: 4 })
    const before = { L: player.closed_cards.L, O: player.closed_cards.O }

    game.tradeRequestIO(player.id, '*4', { L: 4 }, { O: 1 })
    assert.equal(player.closed_cards.L, before.L - 4)
    assert.equal(player.closed_cards.O, before.O + 1)

    game.tradeRequestIO(player.id, '*4', { L: 4 }, { O: 1 }) // no cards left
    assert.equal(player.closed_cards.O, before.O + 1, 'trade without resources rejected')
  })

  await t.test('trade with another player', () => {
    const p1 = game.getActivePlayer()
    const p2 = game.getOpponents(p1.id)[0]
    p1.giveCards({ W: 1 }); p2.giveCards({ S: 1 })
    const before = { p1W: p1.closed_cards.W, p1S: p1.closed_cards.S, p2W: p2.closed_cards.W, p2S: p2.closed_cards.S }

    game.tradeRequestIO(p1.id, 'Px', { W: 1 }, { S: 1 })
    assert.equal(game.ongoing_trades.length, 1)
    const trade = game.ongoing_trades[0]
    assert.equal(trade.status, 'open')

    game.tradeResponseIO(p2.id, trade.id, true)
    assert.equal(trade.status, 'success')
    assert.equal(p1.closed_cards.W, before.p1W - 1)
    assert.equal(p1.closed_cards.S, before.p1S + 1)
    assert.equal(p2.closed_cards.W, before.p2W + 1)
    assert.equal(p2.closed_cards.S, before.p2S - 1)
  })

  await t.test('rolling a 7 drops cards and moves the robber', async () => {
    game.endTurnIO() // next player rolls
    assert.equal(game.state, ST.PLAYER_ROLL)
    const roller = game.getActivePlayer()
    const victim = game.getOpponents(roller.id)[0]
    // Push one player over the hand limit so the drop phase triggers
    victim.giveCards({ L: 10 })
    game._dice = { roll: () => ({ d1: 3, d2: 4 }) }

    game.playerRollIO()
    assert.equal(game.state, ST.ROBBER_DROP)
    assert.deepEqual(game.robbing_players, [victim.id])

    const drop_count = Math.floor(victim.resource_count / 2)
    const before_count = victim.resource_count
    game.robberDropIO(victim.id, { L: drop_count })
    assert.equal(victim.resource_count, before_count - drop_count)
    assert.deepEqual(game.robbing_players, [])
    assert.equal(game.state, ST.ROBBER_MOVE)

    await tick(0) // drop phase schedules the move phase on the next tick
    const tile_id = game.board.getRobbableTiles()[0]
    game.robberMoveIO(roller.id, tile_id)
    assert.equal(game.board.robber_loc, tile_id)
    assert.equal(game.state, ST.PLAYER_ACTIONS)
  })

  await t.test('reaching win_points ends the game', async () => {
    const winner = game.getPlayer(1)
    winner.changeVp(game.config.win_points - winner.public_vps)

    await tick(250) // game end is deferred by 200ms
    assert.equal(game.state, ST.END)
    assert.equal(game.end_context.pid, winner.id)
    assert.equal(game.end_context.vps, game.config.win_points)
    clearTimeout(game._endCleanupTimer) // otherwise it keeps the process alive for 240s
  })
})
