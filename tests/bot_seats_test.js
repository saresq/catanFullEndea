// Bots as occupants of a seat: lobby add/remove, names, host rules, takeover, rematch.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Game from '../models/game.js'
import { loadNames, pickName, BUILT_IN_NAMES } from '../models/bots/names.js'
import { rematchNonVoters, createRematch } from '../models/rematch.js'
import * as CONST from '../public/js/const.js'
import { until } from './helpers.js'
import { botLobby, playSetup, spyIo } from './bot_helpers.js'

const ST = CONST.GAME_STATES
const SOC = CONST.SOCKET_EVENTS
const tmpFile = (name, content) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bot-names-')), name)
  if (content !== undefined) { fs.writeFileSync(file, content) }
  return file
}
const quietly = fn => {
  const warn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args.join(' '))
  try { return { value: fn(), warnings } } finally { console.warn = warn }
}

test('the host adds and removes bots in the lobby', () => {
  const { io, events } = spyIo()
  const { game } = botLobby({ humans: 2, config: { player_count: 4 }, io })

  const bot = game.addBotIO(1, 'medium')
  assert.ok(bot, 'bot seated')
  assert.equal(bot.is_bot, true)
  assert.equal(bot.bot_level, 'medium')
  assert.ok(bot.name)
  assert.equal(new Set(game.players.filter(Boolean).map(p => p.color_id)).size, 3, 'a colour of its own')
  const joined = events.find(([ev, p]) => ev === SOC.JOINED_WAITING_ROOM && p.id === bot.id)
  assert.equal(JSON.parse(JSON.stringify(joined[1])).bot_level, 'medium', 'clients are told it is a bot')
  assert.equal(game.getPlayer(1).toJSON().is_bot, false)

  game.removeBotIO(1, bot.id)
  assert.equal(game.hasPlayer(bot.id), false)
  assert.equal(game.join('Cleo').id, bot.id, 'a human can take the freed seat')
})

test('bad levels, non-hosts, full rooms and human seats are refused', () => {
  const { game } = botLobby({ humans: 2, config: { player_count: 3 } })
  assert.equal(game.addBotIO(1, 'tryhard'), undefined)
  assert.equal(game.addBotIO(1, undefined), undefined)
  assert.equal(game.addBotIO(2, 'easy'), undefined, 'only the host')
  assert.equal(game.players.filter(Boolean).length, 2)

  const bot = game.addBotIO(1, 'easy')
  assert.equal(game.addBotIO(1, 'easy'), undefined, 'room is full')
  game.removeBotIO(2, bot.id)
  assert.ok(game.hasPlayer(bot.id), 'a non-host cannot remove a bot')
  game.removeBotIO(1, 2)
  assert.ok(game.hasPlayer(2), 'a human is not removed as a bot')

  game.waitingRoomStartGameIO(1)
  assert.equal(game.state, ST.INITIAL_SETUP, 'bots count as present')
  assert.equal(game.addBot('easy'), undefined, 'lobby only')
  game.removeBot(bot.id)
  assert.ok(game.hasPlayer(bot.id))
  game.clearTimer()
})

test('the host changes a bot\'s level in place', () => {
  const { io, events } = spyIo()
  const { game } = botLobby({ humans: 2, bots: ['medium'], config: { player_count: 4 }, io })
  const bot = game.getPlayer(3)
  const { name, color_id } = bot
  assert.equal(game.setBotLevelIO(2, 3, 'easy'), undefined, 'only the host')
  assert.equal(game.setBotLevelIO(1, 3, 'tryhard'), undefined, 'not offered yet')
  assert.equal(game.setBotLevelIO(1, 2, 'easy'), undefined, 'not a bot')
  assert.equal(bot.bot_level, 'medium')
  assert.ok(game.setBotLevelIO(1, 3, 'easy'))
  assert.equal(bot.bot_level, 'easy')
  assert.deepEqual([bot.name, bot.color_id], [name, color_id], 'same seat, same identity')
  const sent = events.filter(([ev, p]) => ev === SOC.JOINED_WAITING_ROOM && p.id === 3).pop()
  assert.equal(JSON.parse(JSON.stringify(sent[1])).bot_level, 'easy', 'the room is told')
  game.join('Cleo')
  game.waitingRoomStartGameIO(1)
  assert.equal(game.state, ST.INITIAL_SETUP)
  assert.equal(game.setBotLevel(3, 'medium'), undefined, 'lobby only')
  assert.equal(bot.bot_level, 'easy')
  game.clearTimer()
})

test('player count cannot drop below humans plus bots', () => {
  const { game } = botLobby({ humans: 1, bots: ['easy', 'medium'], config: { player_count: 4 } })
  game.waitingRoomChangeConfigIO(1, { player_count: 2 })
  assert.equal(game.player_count, 3)
})

test('bot names come from the file, cleaned and unique', () => {
  const file = tmpFile('names.json', JSON.stringify(['Ada', 'Linus', ' <b>Ada</b> ', 7, '']))
  assert.deepEqual(loadNames(file).sort(), ['Ada', 'Linus', 'bAda/b'].sort())
  const two = tmpFile('two.json', JSON.stringify(['Ada', 'Linus']))
  const first = pickName([], two)
  const second = pickName([first], two)
  assert.deepEqual([first, second].sort(), ['Ada', 'Linus'])
  const third = pickName([first, second], two)
  assert.ok(third && ![first, second].includes(third), 'more bots than names still get a unique one')
})

test('a missing, empty or broken names file falls back to the built-in list', () => {
  for (const file of [tmpFile('missing.json'), tmpFile('empty.json', '[]'), tmpFile('broken.json', '{nope'), tmpFile('obj.json', '{"a":1}')]) {
    const { value, warnings } = quietly(() => loadNames(file))
    assert.deepEqual(value, BUILT_IN_NAMES)
    assert.equal(warnings.length, 1, 'and says so')
  }
})

test('a bot seat cannot be reclaimed by name', () => {
  const { game } = botLobby({ humans: 1, bots: ['easy'], config: { player_count: 3 } })
  const bot = game.getPlayer(2)
  assert.equal(game.findSeatByName(bot.name), undefined)
  assert.equal(game.findSeatByName('Human 1')?.id, 1)
  const visitor = game.join(bot.name)
  assert.equal(visitor.id, 3, 'same name, own seat')
  assert.equal(game.join(bot.name), undefined, 'or the room is full')
})

test('bots neither keep a lobby open nor host it', () => {
  let ended = 0
  const { io, events } = spyIo()
  const solo = botLobby({ humans: 1, bots: ['easy', 'easy'], onGameEnd: () => ended++ })
  solo.game.removePlayer(1)
  assert.equal(ended, 1, 'the last human left, so the room closed')

  // Seats: host, bot, human
  const { game } = botLobby({ humans: 1, bots: ['easy'], config: { player_count: 3 }, io, onGameEnd: () => ended++ })
  game.join('Cleo')
  game.removePlayer(1)
  assert.equal(ended, 1)
  assert.equal(game.host_pid, 3, 'the bot in seat 2 was passed over')
  assert.ok(events.some(([ev, pid]) => ev === SOC.HOST_CHANGED && pid === 3))
  assert.ok(game.addBotIO(3, 'easy'), 'the new host has the bot controls')
  assert.ok(game.hasPlayer(2), 'existing bots stay')
})

test('the host replaces a quit player with a medium bot that keeps the position', async () => {
  const { io, events } = spyIo()
  const { game } = botLobby({ humans: 3, io })
  game.start()
  await playSetup(game)
  const quitter = game.getPlayer(2)
  quitter.giveCards({ O: 2, dK: 1 })
  const before = JSON.parse(JSON.stringify(quitter.toJSON(1)))

  assert.equal(game.replaceWithBotIO(1, 2), undefined, 'the seat has not quit')
  game.removePlayer(2)
  assert.equal(game.replaceWithBotIO(3, 2), undefined, 'not the host')
  assert.equal(quitter.removed, true)

  const bot = game.replaceWithBotIO(1, 2)
  assert.equal(bot, quitter)
  const after = JSON.parse(JSON.stringify(bot.toJSON(1)))
  assert.equal(after.removed, false)
  assert.equal(after.is_bot, true)
  assert.equal(after.bot_level, 'medium')
  assert.notEqual(after.name, before.name)
  for (const key of ['color_id', 'pieces', 'closed_cards', 'public_vps', 'private_vps', 'open_dev_cards', 'trade_offers']) {
    assert.deepEqual(after[key], before[key], key + ' kept')
  }
  assert.ok(events.some(([ev, p]) => ev === SOC.SEAT_TAKEN_OVER && p.id === 2 && p.is_bot))
  assert.equal(game.replaceWithBotIO(1, 2), undefined, 'already taken over')

  // It plays from its next turn: seat 1 rolls and ends, seat 2 must then move the game on to 3
  game.playerRollIO(1)
  if (game.state !== ST.PLAYER_ACTIONS) { return game.clearTimer() } // no 7 in the first round
  game.endTurnIO(1)
  await until(() => game.active_pid === 3, 'the bot to play its turn')
})

test('a host who quits a running game hands the role to the next human', async () => {
  const { io, events } = spyIo()
  const { game } = botLobby({ humans: 2, bots: ['easy'], config: { player_count: 4 }, io })
  game.join('Human 4') // seats: host, human, bot, human
  game.start()
  await playSetup(game)
  game.removePlayer(1)
  assert.equal(game.host_pid, 2)
  assert.ok(events.some(([ev, pid]) => ev === SOC.HOST_CHANGED && pid === 2))
  assert.ok(game.replaceWithBotIO(2, 1), 'the new host decides on the old host\'s seat')
  game.removePlayer(2)
  assert.equal(game.host_pid, 4, 'bots are passed over')
})

test('the game ends once no human is left in it', async () => {
  let ended = 0
  const { game } = botLobby({ humans: 1, bots: ['easy', 'easy'], onGameEnd: () => ended++ })
  game.start()
  await playSetup(game)
  game.removePlayer(1)
  assert.equal(ended, 1)
})

test('rematch: bots count as voted and are seated again at their level', async () => {
  const { game } = botLobby({ humans: 2, bots: ['easy', 'medium'] })
  game.start()
  await playSetup(game)
  const votes = new Set([1])
  assert.deepEqual(rematchNonVoters(game, votes).map(p => p.name), ['Human 2'], 'only the other human is waited on')
  votes.add(2)
  assert.equal(rematchNonVoters(game, votes).length, 0)

  const { game: next, redirects } = createRematch(game, { id: 'next', io: spyIo().io, onGameEnd: () => {} })
  const bots = next.players.filter(p => p?.is_bot)
  assert.deepEqual(bots.map(p => p.bot_level).sort(), ['easy', 'medium'], 'both bots are already in the room')
  assert.deepEqual(Object.keys(redirects), ['1', '2'], 'humans only are redirected')
  assert.equal(typeof next.onAwaiting, 'function', 'the new game has its bot controller')
  assert.ok(next.join('Human 2'), 'and there is a seat for the returning human')
  assert.equal(next.join('Nobody'), undefined)
})

test('rematch: a taken-over seat comes back as a medium bot', async () => {
  const { game } = botLobby({ humans: 3 })
  game.start()
  await playSetup(game)
  game.removePlayer(3)
  game.replaceWithBotIO(1, 3)
  const { game: next } = createRematch(game, { id: 'next2', io: spyIo().io, onGameEnd: () => {} })
  assert.deepEqual(next.players.filter(p => p?.is_bot).map(p => p.bot_level), ['medium'])
})
