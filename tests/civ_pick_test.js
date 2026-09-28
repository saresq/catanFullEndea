// Civilizations: drawn at random on joining, picked in the waiting room, never shared.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as CONST from '../public/js/const.js'
import { botLobby, spyIo } from './bot_helpers.js'

const SOC = CONST.SOCKET_EVENTS
const civs = game => game.players.filter(p => p?.id).map(p => p.civ)

test('everyone who joins gets a civilization nobody else has', () => {
  const { game } = botLobby({ humans: 4, bots: ['easy', 'medium'], config: { player_count: 10 } })
  for (let i = 0; i < 4; i++) game.join('Late ' + i)
  const got = civs(game)
  assert.equal(got.length, 10)
  assert.ok(got.every(c => CONST.CIVS.includes(c)), 'from the list')
  assert.equal(new Set(got).size, got.length, 'no two alike')
})

test('the draw is random, not the first free one', () => {
  const seen = new Set()
  for (let i = 0; i < 40; i++) seen.add(botLobby().game.getPlayer(1).civ)
  assert.ok(seen.size > 3, `host civilizations over 40 lobbies: ${[...seen]}`)
})

test('a player picks a free civilization and everyone is told', () => {
  const { io, events } = spyIo()
  const { game } = botLobby({ humans: 2, config: { player_count: 3 }, io })
  const other = game.getPlayer(2).civ
  const free = CONST.CIVS.find(c => !civs(game).includes(c))

  game.waitingRoomChangeCivIO(1, other)
  assert.notEqual(game.getPlayer(1).civ, other, 'taken by seat 2')
  game.waitingRoomChangeCivIO(1, 'vikings')
  assert.notEqual(game.getPlayer(1).civ, 'vikings', 'not on the list')

  game.waitingRoomChangeCivIO(1, free)
  assert.equal(game.getPlayer(1).civ, free)
  assert.deepEqual(events.filter(([ev]) => ev === SOC.PLAYER_CIV_UPDATED).map(e => e.slice(1)), [[1, free]])
  assert.equal(game.getPlayer(1).toJSON().civ, free, 'sent with the player')
})

test('the civilization is fixed once the game starts, and a freed one can be drawn again', () => {
  const { game } = botLobby({ humans: 2, config: { player_count: 2 } })
  const civ = game.getPlayer(2).civ
  game.removePlayer(2)
  assert.ok(!civs(game).includes(civ), 'seat 2 left')
  game.join('Back')
  game.start()
  const before = game.getPlayer(1).civ
  game.waitingRoomChangeCivIO(1, CONST.CIVS.find(c => !civs(game).includes(c)))
  assert.equal(game.getPlayer(1).civ, before)
})

test('every civilization has its pieces and its CSS', () => {
  const css = fs.readFileSync(new URL('../public/css/civ-pieces.css', import.meta.url), 'utf8')
  for (const civ of CONST.CIVS) {
    for (const kind of ['settlement', 'city']) {
      assert.ok(fs.existsSync(new URL(`../public/images/pieces/civ/${civ}-${kind}.svg`, import.meta.url)), `${civ}-${kind}.svg`)
    }
    assert.ok(css.includes(`[data-civ="${civ}"]`), `${civ} in civ-pieces.css`)
  }
})
