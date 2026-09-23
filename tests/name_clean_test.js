// Player names are cleaned once on the server, and data written into a page's <script> block can
// never close it. Together they keep a hostile name or link from running script in anyone's browser.
import test from 'node:test'
import assert from 'node:assert/strict'
import Game from '../models/game.js'
import Player from '../models/player.js'

const io = { to: () => ({ emit: () => {} }) }
const newGame = (host = 'Alice') => new Game({ id: 'names', io, host: { id: 1, name: host }, config: { player_count: 4 } })

test('markup characters are removed from a name', () => {
  assert.equal(Player.cleanName('<img src=x onerror=f()>'), 'img src=x onerror=f()')
  assert.equal(Player.cleanName('x</script><b>'), 'x/scriptb')
  assert.equal(Player.cleanName(`"a'b\`c\\d&e"`), 'abcde')
})

test('ordinary names are untouched', () => {
  assert.equal(Player.cleanName('María José 2'), 'María José 2')
  assert.equal(Player.cleanName('Cheran(சே)'), 'Cheran(சே)')
  assert.equal(Player.cleanName('  Bob  '), 'Bob')
})

test('names are capped at 24 characters', () => {
  assert.equal(Player.cleanName('a'.repeat(40)), 'a'.repeat(24))
})

test('a name that cleans to nothing falls back to the default name', () => {
  const game = newGame('<>')
  assert.equal(game.getPlayer(1).name, 'Burrito')
  assert.equal(Player.cleanName(undefined), '')
})

test('the host and joiners get cleaned names', () => {
  const game = newGame('<b>Alice</b>')
  const bob = game.join('Bob"><script>')
  assert.equal(game.getPlayer(1).name, 'bAlice/b')
  assert.equal(bob.name, 'Bobscript')
})

test('rejoining with the same typed name finds the cleaned seat', () => {
  const game = newGame()
  game.join('Ana<b>')
  const typed = Player.cleanName('Ana<b>')
  assert.equal(game.players.find(p => p?.name === typed)?.id, 2)
})

test('script-block serialisation leaves no "<"', () => {
  // Same expression as `toScript` in index.js (not importable: that module starts the server).
  const toScript = v => JSON.stringify(v).replace(/</g, '\\u003c')
  const value = { name: '</script><script>alert(1)</script>', mapkey: '<!--' }
  const out = toScript(value)
  assert.ok(!out.includes('<'))
  assert.deepEqual(JSON.parse(out), value)
})
