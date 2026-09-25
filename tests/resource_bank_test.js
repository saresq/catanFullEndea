// The resource bank: a fixed supply per player count that every card comes from and goes back to,
// the shortage rule on a roll, and what a short bank refuses.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { playToFirstRoll } from './helpers.js'
import { setHand, spyIo } from './bot_helpers.js'

const ST = CONST.GAME_STATES
const SOC = CONST.SOCKET_EVENTS
const RES = Object.keys(CONST.RESOURCES)
const sum = obj => Object.values(obj).reduce((m, v) => m + v, 0)

/** A game of `player_count` humans in seat 1's actions phase, timer off, dice that never roll a 7. */
function gameInActions(player_count = 3, events = []) {
  const game = new Game({
    id: 'bank', io: spyIo(events).io, host: { id: 1, name: 'P1' },
    config: { player_count, timer: false }, onGameEnd: () => {},
  })
  for (let i = 2; i <= player_count; i++) { game.join('P' + i) }
  playToFirstRoll(game)
  game.dice = { roll: () => ({ d1: 2, d2: 3 }) }
  game.board.distribute = () => [] // rolls pay nothing unless a test says otherwise
  game.playerRollIO(1)
  assert.equal(game.state, ST.PLAYER_ACTIONS)
  return game
}

/** Cards from the bank into a hand: the way a test deals without breaking the count */
const deal = (game, player, cards) => {
  Object.entries(cards).forEach(([res, n]) => { game.bank[res] -= n })
  player.giveCards(cards)
}

/** Cards in every hand plus the bank, per resource */
const inPlay = game => Object.fromEntries(RES.map(res =>
  [res, game.bank[res] + game.players.reduce((m, p) => m + p.closed_cards[res], 0)]))

test('the bank starts with a stock per player count', () => {
  const stock = n => {
    const game = new Game({ id: 'tier', io: spyIo().io, host: { id: 1, name: 'P1' }, config: { player_count: n }, onGameEnd: () => {} })
    return game.bank
  }
  ;[[2, 19], [4, 19], [5, 24], [6, 24], [7, 29], [8, 29], [9, 34], [10, 34]].forEach(([n, per]) => {
    assert.deepEqual(stock(n), { S: per, L: per, B: per, O: per, W: per }, `${n} players`)
  })
})

test('the bank is public: in the state and broadcast once per move', async () => {
  const events = []
  const game = gameInActions(3, events)
  assert.deepEqual(game.toJSON().bank, game.bank)
  await new Promise(r => setTimeout(r, 0))
  events.length = 0
  setHand(game.getPlayer(1), { L: 1, B: 1 })
  const edge = game.board.getRoadLocationsFromRoads(game.getPlayer(1).pieces.R, 1)[0]
  game.clickedLocationIO(1, CONST.LOCS.EDGE, edge)
  game.board.distribute = () => [{ pid: 1, res: 'O', count: 1 }, { pid: 2, res: 'W', count: 1 }, { pid: 3, res: 'S', count: 1 }]
  game.endTurnIO(1); game.playerRollIO(2) // three hands paid
  await new Promise(r => setTimeout(r, 0))
  const updates = events.filter(([type]) => type === SOC.BANK)
  assert.equal(updates.length, 1, 'the build, the roll and its three payouts coalesce into one broadcast')
  assert.deepEqual(updates[0][1], game.bank)
})

test('what goes back to the bank', async t => {
  await t.test('initial placement takes from the bank', () => {
    const game = new Game({ id: 'setup', io: spyIo().io, host: { id: 1, name: 'P1' }, config: { player_count: 3, timer: false }, onGameEnd: () => {} })
    game.join('P2'); game.join('P3')
    playToFirstRoll(game)
    assert.deepEqual(inPlay(game), { S: 19, L: 19, B: 19, O: 19, W: 19 })
    assert.ok(RES.some(res => game.bank[res] < 19), 'the second settlements were paid from it')
  })

  await t.test('a build returns its cost', () => {
    const game = gameInActions()
    const p1 = game.getPlayer(1)
    setHand(p1, { L: 1, B: 1 })
    const before = { ...game.bank }
    const edge = game.board.getRoadLocationsFromRoads(p1.pieces.R, 1)[0]
    game.clickedLocationIO(1, CONST.LOCS.EDGE, edge)
    assert.equal(p1.pieces.R.length, 3)
    assert.equal(game.bank.L, before.L + 1)
    assert.equal(game.bank.B, before.B + 1)
  })

  await t.test('a development card returns its cost', () => {
    const game = gameInActions()
    setHand(game.getPlayer(1), { W: 1, S: 1, O: 1 })
    const before = { ...game.bank }
    game.buyDevCardIO(1)
    assert.equal(game.getPlayer(1).dev_card_count, 1)
    assert.deepEqual([game.bank.W, game.bank.S, game.bank.O], [before.W + 1, before.S + 1, before.O + 1])
  })

  await t.test('discards return the cards, chosen or random', () => {
    const game = gameInActions()
    setHand(game.getPlayer(2), { L: 4, B: 4 })
    const before = { ...game.bank }
    game.endTurnIO(1)
    game.dice = { roll: () => ({ d1: 3, d2: 4 }) }
    game.playerRollIO(2)
    assert.equal(game.state, ST.ROBBER_DROP)
    game.robberDropIO(2, { L: 2 }) // two chosen, two more at random
    assert.equal(game.getPlayer(2).resource_count, 4)
    assert.equal(game.bank.L + game.bank.B, before.L + before.B + 4)
    assert.ok(game.bank.L >= before.L + 2)
  })

  await t.test('a bank trade returns the given cards and takes the asked one', () => {
    const game = gameInActions()
    setHand(game.getPlayer(1), { S: 4 })
    const before = { ...game.bank }
    game.tradeRequestIO(1, '*4', { S: 4 }, { O: 1 })
    assert.equal(game.getPlayer(1).closed_cards.O, 1)
    assert.equal(game.bank.S, before.S + 4)
    assert.equal(game.bank.O, before.O - 1)
  })
})

test('what leaves the bank alone', async t => {
  await t.test('a player trade', () => {
    const game = gameInActions()
    setHand(game.getPlayer(1), { W: 1 }); setHand(game.getPlayer(2), { S: 1 })
    const before = { ...game.bank }
    game.tradeRequestIO(1, 'Px', { W: 1 }, { S: 1 })
    game.tradeResponseIO(2, 0, true)
    assert.equal(game.getPlayer(1).closed_cards.S, 1, 'traded')
    assert.deepEqual(game.bank, before)
  })

  await t.test('a steal', () => {
    const game = gameInActions()
    const p1 = game.getPlayer(1)
    setHand(p1, {}); setHand(game.getPlayer(2), { O: 3 })
    p1.giveCards({ dK: 1 }); p1.can_play_dc = true
    const before = { ...game.bank }
    const tile = game.board.getRobbableTiles().find(id => game.board.findTile(id).getAllCorners().some(c => c.player_id === 2))
    game.knightMoveIO(1, tile, 2)
    assert.equal(p1.closed_cards.O, 1, 'stole an ore')
    assert.deepEqual(game.bank, before)
  })

  await t.test('Monopoly', () => {
    const game = gameInActions()
    const p1 = game.getPlayer(1)
    setHand(p1, {}); setHand(game.getPlayer(2), { O: 3 }); setHand(game.getPlayer(3), { O: 2 })
    p1.giveCards({ dM: 1 }); p1.can_play_dc = true
    const before = { ...game.bank }
    game.monopolyIO(1, 'O')
    assert.equal(p1.closed_cards.O, 5)
    assert.deepEqual(game.bank, before)
  })
})

test('a roll the bank cannot pay', async t => {
  /** Seat 1 is owed 2 ore and 1 wheat, seat 2 is owed 1 ore */
  const owed = game => {
    game.board.distribute = () => [
      { pid: 1, res: 'O', count: 2 }, { pid: 2, res: 'O', count: 1 }, { pid: 1, res: 'W', count: 1 },
    ]
    game.players.forEach(p => setHand(p, {}))
    game.endTurnIO(1)
  }

  await t.test('two players short of ore: neither gets ore, the wheat is paid', () => {
    const events = []
    const game = gameInActions(3, events)
    owed(game)
    game.bank.O = 2
    events.length = 0
    game.playerRollIO(2)
    assert.equal(game.getPlayer(1).closed_cards.O, 0)
    assert.equal(game.getPlayer(2).closed_cards.O, 0)
    assert.equal(game.bank.O, 2, 'the bank keeps its ore')
    assert.equal(game.getPlayer(1).closed_cards.W, 1, 'the wheat is paid as usual')
    const [, dist, short] = events.find(([type]) => type === SOC.ROLL_DISTRIBUTION)
    assert.deepEqual(short, ['O'])
    assert.deepEqual(dist.find(d => d.pid === 1).res, { W: 1 }, 'the broadcast says what was paid')
  })

  await t.test('one player short: they take what is left', () => {
    const game = gameInActions()
    owed(game)
    game.getPlayer(2).removePlayer() // seat 2 is out of the game, so only seat 1 is owed ore
    game.bank.O = 1
    game.playerRollIO(2)
    assert.equal(game.getPlayer(1).closed_cards.O, 1)
    assert.equal(game.bank.O, 0)
  })

  await t.test('exactly enough pays everyone', () => {
    const game = gameInActions()
    owed(game)
    game.bank.O = 3
    game.playerRollIO(2)
    assert.equal(game.getPlayer(1).closed_cards.O, 2)
    assert.equal(game.getPlayer(2).closed_cards.O, 1)
    assert.equal(game.bank.O, 0)
  })
})

test('a short bank refuses', async t => {
  await t.test('a bank trade for a resource it does not hold', () => {
    const game = gameInActions()
    setHand(game.getPlayer(1), { S: 4 })
    game.bank.O = 0
    game.tradeRequestIO(1, '*4', { S: 4 }, { O: 1 })
    assert.equal(game.getPlayer(1).closed_cards.S, 4, 'nothing moved')
    assert.equal(game.bank.O, 0)
  })

  await t.test('Invention for more than it holds, until the ask fits', () => {
    const game = gameInActions()
    const p1 = game.getPlayer(1)
    setHand(p1, {})
    p1.giveCards({ dY: 1 }); p1.can_play_dc = true
    game.bank.O = 1
    game.yearOfPlentyIO(1, 'O', 'O')
    assert.equal(p1.closed_cards.dY, 1, 'refused: the card stays')
    assert.equal(p1.closed_cards.O, 0)
    game.yearOfPlentyIO(1, 'O', 'W')
    assert.equal(p1.closed_cards.dY, 0)
    assert.deepEqual([p1.closed_cards.O, p1.closed_cards.W], [1, 1])
    assert.equal(game.bank.O, 0)
  })

  await t.test('Invention with an empty bank is refused and keeps the card', () => {
    const game = gameInActions()
    const p1 = game.getPlayer(1)
    setHand(p1, {})
    p1.giveCards({ dY: 1 }); p1.can_play_dc = true
    game.bank = { S: 0, L: 0, B: 0, O: 0, W: 0 }
    game.yearOfPlentyIO(1, 'O', 'W')
    assert.equal(p1.closed_cards.dY, 1)
    assert.equal(p1.resource_count, 0)
  })

  await t.test('Invention with one card in the whole bank takes that card', () => {
    const game = gameInActions()
    const p1 = game.getPlayer(1)
    setHand(p1, {})
    p1.giveCards({ dY: 1 }); p1.can_play_dc = true
    game.bank = { S: 0, L: 0, B: 1, O: 0, W: 0 }
    game.yearOfPlentyIO(1, 'O', 'O')
    assert.equal(p1.closed_cards.dY, 0, 'spent')
    assert.equal(p1.closed_cards.B, 1)
    assert.equal(sum(game.bank), 0)
  })
})

test('bank + hands is the starting supply after every kind of move', () => {
  const game = gameInActions()
  const supply = { S: 19, L: 19, B: 19, O: 19, W: 19 }
  const p1 = game.getPlayer(1), p2 = game.getPlayer(2), p3 = game.getPlayer(3)
  const check = label => assert.deepEqual(inPlay(game), supply, label)
  check('after placement')
  // A road and a development card
  deal(game, p1, { L: 1, B: 1, W: 1, S: 1, O: 1 })
  game.clickedLocationIO(1, CONST.LOCS.EDGE, game.board.getRoadLocationsFromRoads(p1.pieces.R, 1)[0])
  game.buyDevCardIO(1)
  check('after a build and a dev card')
  // Bank trade
  deal(game, p1, { S: 4 })
  game.tradeRequestIO(1, '*4', { S: 4 }, { O: 1 })
  check('after a bank trade')
  // Player trade and a proposal
  deal(game, p2, { W: 1 })
  game.tradeRequestIO(1, 'Px', { O: 1 }, { W: 1 })
  game.tradeResponseIO(2, 0, true)
  game.tradeRequestIO(3, 'Px', {}, { W: 1 })
  check('after player trades')
  // Invention, Monopoly, Road Building, a Knight's steal
  p1.giveCards({ dY: 1, dM: 1, dR: 1, dK: 1 })
  p1.can_play_dc = true; game.yearOfPlentyIO(1, 'O', 'B')
  p1.can_play_dc = true; game.monopolyIO(1, 'W')
  p1.can_play_dc = true; game.roadBuildingIO(1)
  const tile = game.board.getRobbableTiles().find(id => game.board.findTile(id).getAllCorners().some(c => c.player_id === 2))
  deal(game, p2, { L: 2 })
  p1.can_play_dc = true; game.knightMoveIO(1, tile, 2)
  check('after every development card')
  // A roll with production, then a seven with discards
  game.board.distribute = () => [{ pid: 2, res: 'O', count: 2 }, { pid: 3, res: 'L', count: 1 }]
  game.endTurnIO(1)
  game.playerRollIO(2)
  check('after a roll')
  deal(game, p3, { B: 9 })
  game.endTurnIO(2)
  game.dice = { roll: () => ({ d1: 3, d2: 4 }) }
  game.playerRollIO(3)
  assert.equal(game.state, ST.ROBBER_DROP)
  game.robberDropIO(3, { B: 3 })
  check('after a discard')
})
