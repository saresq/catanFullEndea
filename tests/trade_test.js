// Player-trade requests: withdrawing your own request, and what a settled request refuses.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'

const ST = CONST.GAME_STATES
const fakeIo = { to: () => ({ emit: () => {} }) }

/** A game parked in PLAYER_ACTIONS, ready to trade. */
function gameInActions(config = {}) {
  const game = new Game({
    id: 'trade', io: fakeIo,
    host: { id: 1, name: 'Alice' },
    config: { player_count: 3, timer: false, ...config },
    onGameEnd: () => {},
  })
  game.join('Bob'); game.join('Cleo')
  game.start()
  let guard = 0
  while (game.state === ST.INITIAL_SETUP && guard++ < 20) { game.initialBuildIO(game.active_pid) }
  game.playerRollIO()
  assert.equal(game.state, ST.PLAYER_ACTIONS)
  return game
}

test('withdrawing a trade request', async t => {
  await t.test('the requester deletes their own request and keeps their cards', () => {
    const game = gameInActions()
    const p1 = game.getActivePlayer()
    p1.giveCards({ W: 1 })
    const before = p1.closed_cards.W

    game.tradeRequestIO(p1.id, 'Px', { W: 1 }, { S: 1 })
    const trade = game.ongoing_trades[0]
    assert.equal(trade.status, 'open')

    game.tradeResponseIO(p1.id, trade.id, false)
    assert.equal(trade.status, 'deleted')
    assert.equal(p1.closed_cards.W, before, 'withdrawing costs nothing')
  })

  await t.test('withdrawing frees a request slot', () => {
    const game = gameInActions({ max_trade_requests: 1 })
    const p1 = game.getActivePlayer()
    p1.giveCards({ W: 2 })

    game.tradeRequestIO(p1.id, 'Px', { W: 1 }, { S: 1 })
    game.tradeRequestIO(p1.id, 'Px', { W: 1 }, { B: 1 })
    assert.equal(game.ongoing_trades.length, 1, 'limit holds while the first is open')

    game.tradeResponseIO(p1.id, 0, false)
    game.tradeRequestIO(p1.id, 'Px', { W: 1 }, { B: 1 })
    assert.equal(game.ongoing_trades.length, 2, 'a withdrawn request no longer counts')
    assert.equal(game.ongoing_trades[1].status, 'open')
  })

  await t.test('a withdrawn request cannot be accepted afterwards', () => {
    const game = gameInActions()
    const p1 = game.getActivePlayer()
    const p2 = game.getOpponents(p1.id)[0]
    p1.giveCards({ W: 1 }); p2.giveCards({ S: 1 })
    const before = { p1W: p1.closed_cards.W, p2S: p2.closed_cards.S }

    game.tradeRequestIO(p1.id, 'Px', { W: 1 }, { S: 1 })
    game.tradeResponseIO(p1.id, 0, false)
    game.tradeResponseIO(p2.id, 0, true)

    assert.equal(game.ongoing_trades[0].status, 'deleted')
    assert.equal(p1.closed_cards.W, before.p1W, 'no resources moved')
    assert.equal(p2.closed_cards.S, before.p2S)
  })

  await t.test('the requester cannot accept their own request', () => {
    const game = gameInActions()
    const p1 = game.getActivePlayer()
    p1.giveCards({ W: 1 })

    game.tradeRequestIO(p1.id, 'Px', { W: 1 }, { S: 1 })
    game.tradeResponseIO(p1.id, 0, true)
    assert.equal(game.ongoing_trades[0].status, 'open', 'accepting your own request does nothing')
  })
})

test('a settled request is closed for good', async t => {
  await t.test('a successful trade cannot be accepted twice', () => {
    const game = gameInActions()
    const p1 = game.getActivePlayer()
    const [p2, p3] = game.getOpponents(p1.id)
    p1.giveCards({ W: 2 }); p2.giveCards({ S: 1 }); p3.giveCards({ S: 1 })

    game.tradeRequestIO(p1.id, 'Px', { W: 1 }, { S: 1 })
    game.tradeResponseIO(p2.id, 0, true)
    const after_first = { p1W: p1.closed_cards.W, p1S: p1.closed_cards.S, p3S: p3.closed_cards.S }

    game.tradeResponseIO(p3.id, 0, true) // second taker on the same request
    assert.equal(p1.closed_cards.W, after_first.p1W, 'the requester pays once')
    assert.equal(p1.closed_cards.S, after_first.p1S)
    assert.equal(p3.closed_cards.S, after_first.p3S, 'the second taker keeps their card')
  })
})
