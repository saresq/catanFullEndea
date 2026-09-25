// Trade requests: withdrawing your own request, what a settled request refuses, and bank rates.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { rollOff } from './helpers.js'

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
  rollOff(game)
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

test('a bank rate needs its port', async t => {
  /** The random setup may land on a port, so set what the player owns by hand. */
  function playerWithPorts(ports = {}) {
    const game = gameInActions()
    const p1 = game.getActivePlayer()
    Object.keys(CONST.TRADE_OFFERS).forEach(type => { p1.trade_offers[type] = false })
    Object.assign(p1.trade_offers, { Px: true, '*4': true }, ports)
    p1.giveCards({ S: 4 })
    return { game, p1, sheep: p1.closed_cards.S, brick: p1.closed_cards.B }
  }

  await t.test('3:1 and 2:1 are refused without the port', () => {
    const { game, p1, sheep, brick } = playerWithPorts()
    game.tradeRequestIO(p1.id, '*3', { S: 3 }, { B: 1 })
    game.tradeRequestIO(p1.id, 'S2', { S: 2 }, { B: 1 })
    assert.equal(p1.closed_cards.S, sheep, 'no sheep left the hand')
    assert.equal(p1.closed_cards.B, brick, 'no brick arrived')
  })

  await t.test('4:1 works for everyone', () => {
    const { game, p1, sheep, brick } = playerWithPorts()
    game.tradeRequestIO(p1.id, '*4', { S: 4 }, { B: 1 })
    assert.equal(p1.closed_cards.S, sheep - 4)
    assert.equal(p1.closed_cards.B, brick + 1)
  })

  await t.test('an owned port trades at its rate', () => {
    const { game, p1, sheep, brick } = playerWithPorts({ S2: true })
    game.tradeRequestIO(p1.id, 'S2', { S: 2 }, { B: 1 })
    assert.equal(p1.closed_cards.S, sheep - 2)
    assert.equal(p1.closed_cards.B, brick + 1)
  })

  await t.test('an unknown trade type is refused', () => {
    const { game, p1, sheep } = playerWithPorts()
    game.tradeRequestIO(p1.id, '*1', { S: 1 }, { B: 1 })
    assert.equal(p1.closed_cards.S, sheep)
  })
})
