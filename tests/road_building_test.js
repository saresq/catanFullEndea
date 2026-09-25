// Road Building (dev card `dR`): as many roads as the player has left, up to two, and never spent on nothing.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import * as CONST from '../public/js/const.js'
import { buildView } from '../models/bots/view.js'
import { legalMoves } from '../models/bots/moves.js'
import { rollOff } from './helpers.js'

const ST = CONST.GAME_STATES
const fakeIo = { to: () => ({ emit: () => {} }) }

/** A 3-player game sitting in PLAYER_ACTIONS, with the active player holding one `dR`. */
function playingGame() {
  const game = new Game({
    id: 'road-building', io: fakeIo,
    host: { id: 1, name: 'Alice' },
    config: { player_count: 3, timer: false },
    onGameEnd: () => {},
  })
  game.join('Bob'); game.join('Cleo')
  game.start()
  rollOff(game)
  let guard = 0
  while (game.state === ST.INITIAL_SETUP && guard++ < 20) { game.initialBuildIO(game.active_pid) }
  game.dice = { roll: () => ({ d1: 3, d2: 3 }) } // never a 7: no robber phase
  game.playerRollIO()
  assert.equal(game.state, ST.PLAYER_ACTIONS)

  const player = game.getActivePlayer()
  player.giveCards({ dR: 1 })
  player.resetDevCard(true)
  return { game, player }
}

test('Road Building builds two roads', () => {
  const { game, player } = playingGame()
  const before = player.pieces.R.length

  game.roadBuildingIO(player.id) // no locations: the server picks legal ones
  assert.equal(player.pieces.R.length, before + 2, 'both roads placed')
  assert.equal(player.closed_cards.dR, 0, 'card spent')
})

test('Road Building is refused when no edge is legal, and keeps the card', () => {
  const { game, player } = playingGame()
  // No roads on the board means no edge to extend from - the same dead end a
  // boxed-in player reaches. It used to spend the card and build nothing.
  player.pieces.R = []

  game.roadBuildingIO(player.id)
  assert.equal(player.pieces.R.length, 0, 'nothing built')
  assert.equal(player.closed_cards.dR, 1, 'card still in hand')
  assert.ok(player.can_play_dc, 'and still playable this turn')
})

test('Road Building with one piece left builds that one road', () => {
  const { game, player } = playingGame()
  player.pieces.R = Array(14).fill(player.pieces.R[0])

  game.roadBuildingIO(player.id)
  assert.equal(player.pieces.R.length, 15, 'the last piece placed')
  assert.equal(player.closed_cards.dR, 0, 'card spent')
})

test('Road Building with no piece left is refused, and keeps the card', () => {
  const { game, player } = playingGame()
  player.pieces.R = Array(15).fill(player.pieces.R[0])

  game.roadBuildingIO(player.id)
  assert.equal(player.pieces.R.length, 15, 'nothing built')
  assert.equal(player.closed_cards.dR, 1, 'card still in hand')
})

test('a bot may play Road Building with one piece left', () => {
  const { game, player } = playingGame()
  player.pieces.R = Array(14).fill(player.pieces.R[0])
  const view = buildView(game, player.id)
  const moves = legalMoves(view, ST.PLAYER_ACTIONS)
  assert.ok(moves.some(m => m.type === 'road_building'), 'the intent is offered')
  player.pieces.R = Array(15).fill(player.pieces.R[0])
  const none = legalMoves(buildView(game, player.id), ST.PLAYER_ACTIONS)
  assert.ok(!none.some(m => m.type === 'road_building'), 'not with no piece left')
})
