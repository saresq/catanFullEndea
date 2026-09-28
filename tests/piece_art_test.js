// Baked board pieces (public/js/ui/piece_art.js): the colours and the SVG they are drawn with.
// Pixel equality with the live art needs a browser: tests/visual/piece_art_check.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { hardLight, tintSvg, bakeSvg, MARGIN } from '../public/js/ui/piece_art.js'

const art = name => fs.readFileSync(new URL(`../public/images/pieces/${name}`, import.meta.url), 'utf8')

test('hard-light: mid grey keeps the colour, black and white stay black and white', () => {
  assert.equal(hardLight('#7f7f7f', '#d61b2a'), '#d51b2a')
  assert.equal(hardLight('#000000', '#355fe6'), '#000000')
  assert.equal(hardLight('#ffffff', '#355fe6'), '#ffffff')
  // below mid grey multiplies, above it screens: 0x40 is half the colour, 0xc0 halfway to white
  assert.equal(hardLight('#404040', '#d61b2a'), '#6b0e15')
  assert.equal(hardLight('#c0c0c0', '#355fe6'), '#9bb0f3')
})

test('every paint of the art is tinted, gradient stops included, ids and references left alone', () => {
  const svg = tintSvg(art('settlement.svg'), '#34b050')
  assert.ok(!/(fill|stroke|stop-color)="#([0-9a-f])\2\2\2\2\2"/i.test(svg.replace(/#000000|#ffffff/gi, '')), 'no grey left')
  assert.ok(svg.includes('fill="url(#roof)"'))
})

test('a baked piece: the art box plus the margin, shadows under a plain copy of the art', () => {
  const box = { x: 0, y: 0, w: 48, h: 48 }
  const svg = bakeSvg(art('city.svg'), '#d61b2a', box, [[.5, 0, 0, 'rgb(0 0 0 / .55)'], [-4, 4.8, 2.75, 'rgb(0 0 0 / .74)']])
  assert.match(svg, new RegExp(`viewBox="${-MARGIN} ${-MARGIN} ${48 + 2 * MARGIN} ${48 + 2 * MARGIN}"`))
  assert.equal((svg.match(/<filter /g) || []).length, 1, 'the outline step needs no blur')
  assert.match(svg, /stdDeviation="2.75"/)
  assert.match(svg, /translate\(-4 4\)/, 'offsets floored to whole px, as Chrome draws them')
  // the art is last, so it is on top, and it is the tinted one
  const last = svg.slice(svg.lastIndexOf('<svg '))
  assert.ok(!last.includes('#5a5a5a') && last.includes(hardLight('#5a5a5a', '#d61b2a')))
  assert.ok(!/id="(front)"[\s\S]*id="\1"/.test(svg), 'no duplicate gradient id')
})
