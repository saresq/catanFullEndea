// The translation layer: lookup, interpolation, plurals, fallback, and the shape every locale
// file has to keep (same keys as `en`, complete plural entries, the exempt lines untouched).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createT, LOCALES, LOCALE, t } from '../public/js/i18n.js'
import en from '../public/locales/en.js'
import * as CONST from '../public/js/const.js'

/** Every leaf key of a dictionary, dotted. Plural objects count as one leaf. */
function leafKeys(node, prefix = '') {
  if (typeof node !== 'object' || node === null) return [prefix]
  if ('one' in node || 'other' in node) return [prefix]
  return Object.entries(node).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k))
}

const lookup = (dict, key) => key.split('.').reduce((o, k) => o?.[k], dict)

/** Lines that stay byte-identical in every language. */
const EXEMPT = [
  'log.robber_self', 'end.not_voted', 'end.non_voters', 'page.title', 'page.editor_title',
  'about.title',
]

test('t fills placeholders and leaves unknown ones as written', () => {
  const { t } = createT('en')
  assert.equal(t('log.building', { name: 'Ana', piece: 'a City' }), 'Ana built a City.')
  assert.equal(t('lobby.color_n', { n: 3 }), 'Color 3')
  assert.equal(t('lobby.color_n'), 'Color {n}')
})

test('t.plural picks one / other and fills {n}', () => {
  const { t } = createT('en')
  assert.equal(t.plural('trade.cards', 1), '1 card')
  assert.equal(t.plural('trade.cards', 3), '3 cards')
  assert.equal(t.plural('notice.map_seats', 1), 'That map only fits 1 player.')
  assert.equal(t.plural('notice.map_seats', 4), 'That map only fits 4 players.')
})

test('t.plural in es-AR', { skip: !Object.keys(LOCALES['es-AR']).length && 'es-AR not written yet' }, () => {
  const { t } = createT('es-AR')
  assert.equal(t.plural('trade.cards', 1), '1 carta')
  assert.equal(t.plural('trade.cards', 3), '3 cartas')
})

test('a missing key falls back to en, then to the key itself', () => {
  const { t } = createT('es-AR')
  // Every en key resolves in every locale: through the locale or through the fallback.
  leafKeys(en).forEach(key => assert.ok(t.has(key), key))
  assert.equal(t('no.such.key'), 'no.such.key')
  assert.equal(t.has('no.such.key'), false)
  // A plural entry asked for as a string, and a string asked for as a plural, both hand the key back.
  assert.equal(t('trade.cards'), 'trade.cards')
  assert.equal(t.plural('lobby.leave', 2), 'lobby.leave')
})

test('the page translator is the one for LOCALE', () => {
  assert.ok(LOCALES[LOCALE], `LOCALE ${LOCALE} is a shipped locale`)
  assert.equal(t('lobby.leave'), createT(LOCALE).t('lobby.leave'))
})

test('every locale has exactly the keys of en', () => {
  const expected = leafKeys(en).sort()
  Object.entries(LOCALES).forEach(([locale, dict]) => {
    if (locale === 'en') return
    const keys = leafKeys(dict).sort()
    const missing = expected.filter(k => !keys.includes(k))
    const extra = keys.filter(k => !expected.includes(k))
    assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, `${locale} key set differs from en`)
  })
})

test('every plural entry has one and other, and strings stay strings across locales', () => {
  Object.entries(LOCALES).forEach(([locale, dict]) => {
    leafKeys(en).forEach(key => {
      const ref = lookup(en, key), value = lookup(dict, key)
      if (value === undefined) return // parity test reports it
      if (typeof ref === 'object') {
        assert.equal(typeof value, 'object', `${locale}: ${key} is a plural entry`)
        assert.equal(typeof value.one, 'string', `${locale}: ${key}.one`)
        assert.equal(typeof value.other, 'string', `${locale}: ${key}.other`)
      } else {
        assert.equal(typeof value, 'string', `${locale}: ${key} is a string`)
      }
    })
  })
})

test('the exempt lines are identical in every locale', () => {
  Object.entries(LOCALES).forEach(([locale, dict]) => {
    EXEMPT.forEach(key => {
      const value = lookup(dict, key)
      if (value === undefined) return // parity test reports it
      assert.equal(value, lookup(en, key), `${locale}: ${key}`)
    })
  })
})

test('the noun tables cover every key the game uses', () => {
  const has = (table, keys) => keys.forEach(k =>
    assert.ok(lookup(en, `names.${table}.${k}`) !== undefined, `names.${table}.${k}`))
  has('pieces', Object.keys(CONST.PIECES_COUNT))
  has('resources', Object.values(CONST.TILE_RES))
  has('tiles', [...Object.keys(CONST.TILE_RES), 'D', 'S'])
  has('ports', Object.keys(CONST.TRADE_OFFERS))
  has('maps', [...Object.keys(CONST.MAPS), 'custom'])
  has('bot_levels', CONST.BOT_LEVELS.map(l => l.id))
  has('cards', Object.keys(CONST.DEVELOPMENT_CARDS))
  has('dice_modes', ['random', 'balanced'])
  has('directions', Object.values(CONST.DIR_HELPER.KEYS))
  Object.keys(CONST.COST).filter(k => k !== 'DEV_C').forEach(k =>
    assert.equal(typeof lookup(en, `names.pieces.${k}.with_article`), 'string', `names.pieces.${k}.with_article`))
})

test('the const tables are the dictionary values', () => {
  assert.equal(CONST.PIECES.S, t('names.pieces.S.name'))
  assert.equal(CONST.RESOURCES.W, t('names.resources.W'))
  assert.equal(CONST.DEVELOPMENT_CARDS.dK, t('names.cards.dK'))
  assert.equal(CONST.TRADE_OFFERS['*3'], t('names.ports.*3'))
  assert.equal(CONST.BOT_LEVELS.find(l => l.id === 'easy').name, t('names.bot_levels.easy.name'))
  assert.equal(CONST.mapId(CONST.MAPS.argentum.mapkey), 'argentum')
  assert.equal(CONST.mapId('S S S\n+S S S'), 'custom')
})
