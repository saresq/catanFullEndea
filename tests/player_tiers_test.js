// Numbers per player count: the discard limit is 7 at every size, the victory target is 10 up to
// 6 players, and the development deck grows by the expansion's step per tier.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { playToFirstRoll } from './helpers.js'
import { setHand } from './bot_helpers.js'

const ST = CONST.GAME_STATES
const io = { to: () => ({ emit: () => {} }) }

function newGame(config) {
  const game = new Game({ id: 'tiers', io, host: { id: 1, name: 'P1' }, config: { timer: false, ...config }, onGameEnd: () => {} })
  for (let i = 2; i <= game.player_count; i++) { game.join('P' + i) }
  return game
}

const count = (deck, card) => deck.filter(c => c === card).length

test('a six-player game discards above seven cards, not eight', () => {
  const game = newGame({ player_count: 6 })
  playToFirstRoll(game)
  assert.equal(game.config.robber_hand_limit, 7)
  game.players.forEach(p => setHand(p, p.id === 2 ? { L: 7 } : p.id === 3 ? { L: 8 } : {}))
  game.dice = { roll: () => ({ d1: 3, d2: 4 }) }
  game.playerRollIO(1)
  assert.equal(game.state, ST.ROBBER_DROP)
  assert.deepEqual(game.robbing_players, [3], 'exactly seven is safe, eight is not')
  game.robberDropIO(3, {})
  assert.equal(game.getPlayer(3).resource_count, 4)
  game.clearTimer()
})

test('victory target: 10 up to six players, 12 and 13 above, the host\'s override kept', () => {
  assert.equal(newGame({ player_count: 4 }).config.win_points, 10)
  assert.equal(newGame({ player_count: 6 }).config.win_points, 10)
  assert.equal(newGame({ player_count: 8 }).config.win_points, 12)
  assert.equal(newGame({ player_count: 10 }).config.win_points, 13)
  assert.equal(newGame({ player_count: 6, win_points: 12 }).config.win_points, 12)
  const lobby = newGame({ player_count: 4 })
  lobby.waitingRoomChangeConfigIO(1, { player_count: 6 })
  assert.equal(lobby.config.win_points, 10, 'the lobby shows the tier default')
})

test('development decks: 25, 35, 46 and 57 cards, one expansion step per tier', () => {
  const expected = {
    4: { dK: 14, dR: 2, dY: 2, dM: 2, dVp: 5, total: 25 },
    6: { dK: 20, dR: 3, dY: 3, dM: 3, dVp: 6, total: 35 },
    8: { dK: 26, dR: 4, dY: 4, dM: 4, dVp: 8, total: 46 },
    10: { dK: 32, dR: 5, dY: 5, dM: 5, dVp: 10, total: 57 },
  }
  Object.entries(expected).forEach(([players, { total, ...cards }]) => {
    const deck = newGame({ player_count: +players }).dev_cards
    assert.equal(deck.length, total, `${players} players: ${total} cards`)
    Object.entries(cards).forEach(([card, n]) => assert.equal(count(deck, card), n, `${players} players: ${n} ${card}`))
  })
  assert.ok(!CONST.PLAYER_TIERS.some(t => 'robber_hand_limit' in t), 'the limit is not a tier number')
})
