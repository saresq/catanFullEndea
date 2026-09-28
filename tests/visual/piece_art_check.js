/**
 * Baked pieces against live ones, pixel for pixel (js/ui/piece_art.js).
 *
 *   PORT=3100 node index.js &
 *   NODE_PATH=<dir with playwright>/node_modules node tests/visual/piece_art_check.js [base_url]
 *
 * Draws the same tiles twice on a page of the running server - settlements, cities and a road at
 * each angle, in every player colour and civilization, with civ pieces on and off - once with the
 * live art (blend, mask, CSS filters) and once baked (.board.baked), then compares the two
 * screenshots at several device pixel ratios and board zooms. Prints the differences and writes
 * the pairs and a heat map of the difference next to this file's output folder (argv or /tmp).
 * Not a test: needs a browser, so `npm test` does not run it.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { CIVS } from '../../public/js/const.js'

const BASE = process.argv[2] || 'http://localhost:3100'
const OUT = process.env.OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'piece-art-'))
let chromium
try { ({ chromium } = createRequire(import.meta.url)('playwright')) } catch (e) {
  console.error('Playwright not found. Install it outside the repo and run with NODE_PATH=<that>/node_modules.')
  process.exit(1)
}

const PAGE = `<!DOCTYPE html><html><head><link rel="stylesheet" href="/css/index.css">
<style>
  body { margin: 0; background: #2d6f8e; }
  .row { display: flex; flex-wrap: wrap; gap: 0; padding: 20px; width: 1060px; transform-origin: 0 0; }
  .row .board { position: relative; display: contents; }
  .row .tile { position: relative !important; display: inline-block; width: 151px; height: 176px; margin: 8px 30px 30px 8px;
    left: auto !important; top: auto !important; background: url(/images/tiles/Grassland.webp) center / cover; }
  .row .tile:nth-child(3n+2) { background-image: url(/images/tiles/Mountain.webp); }
  .row .tile:nth-child(3n) { background-image: url(/images/tiles/Fields.webp); }
</style></head><body>
<div id="live" class="row"><div class="board"></div></div>
<div id="baked" class="row"><div class="board baked"></div></div>
<script type="module">
  import PieceArt from '/js/ui/piece_art.js'
  window.setup = async ({ civs, zoom }) => {
    const tiles = [...Array(10).keys()].map(i => {
      const pid = i + 1, civ = civs[i]
      const cls = 'taken no-drop p' + pid + ' pc' + pid
      return '<div class="tile G"><div class="corners">' +
        '<div class="corner ' + cls + '" data-taken="S" data-civ="' + civ + '" data-dir="top"></div>' +
        '<div class="corner ' + cls + '" data-taken="C" data-civ="' + civ + '" data-dir="bottom"></div></div><div class="edges">' +
        ['right', 'bottom-right', 'bottom-left'].map(d => '<div class="edge ' + cls + '" data-dir="' + d + '"></div>').join('') +
        '</div></div>'
    }).join('')
    for (const id of ['live', 'baked']) {
      const $row = document.getElementById(id)
      $row.querySelector('.board').innerHTML = tiles
      $row.style.transform = 'scale(' + zoom + ')'
    }
    const colourOf = pid => getComputedStyle(document.documentElement).getPropertyValue('--player-' + pid + '-color').trim()
    window.art ??= new PieceArt(document.createElement('div'), { colourOf, civOf: pid => window.civs[pid - 1] })
    window.civs = civs
    await window.art.setPlayers([...Array(10).keys()].map(i => i + 1))
    await Promise.all([...document.images].map(i => i.decode?.()))
  }
</script></body></html>`

const b = await chromium.launch()
const report = []
for (const dpr of [1, 2, 3]) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: dpr })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', e => errors.push(e.message))
  await p.route(BASE + '/__piece_art_check', r => r.fulfill({ contentType: 'text/html', body: PAGE }))
  await p.goto(BASE + '/__piece_art_check')
  for (const zoom of [1, .6]) for (const civ_on of [true, false]) for (const batch of [0, 1]) {
    const civs = [...Array(10).keys()].map(i => CIVS[(i + batch * 10) % CIVS.length])
    await p.evaluate(on => document.documentElement.classList.toggle('civ-pieces', on), civ_on)
    await p.evaluate(opts => window.setup(opts), { civs, zoom })
    await p.waitForTimeout(300)
    const shot = async id => {
      const r = await p.evaluate(id => { const q = document.getElementById(id).getBoundingClientRect(); return { x: q.x, y: q.y, width: q.width, height: q.height } }, id)
      return p.screenshot({ clip: r })
    }
    // one row at a time on screen, the other hidden, so both render at the same place
    await p.evaluate(() => { document.getElementById('baked').style.display = 'none' })
    const live = await shot('live')
    await p.evaluate(() => { document.getElementById('live').style.display = 'none'; document.getElementById('baked').style.display = '' })
    const baked = await shot('baked')
    await p.evaluate(() => { document.getElementById('live').style.display = '' })
    const name = `dpr${dpr}-zoom${zoom}-${civ_on ? 'civ' : 'classic'}-${batch}`
    const diff = await p.evaluate(async ([a, c]) => {
      const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + src })
      const [ia, ib] = await Promise.all([load(a), load(c)])
      const W = Math.min(ia.width, ib.width), H = Math.min(ia.height, ib.height)
      const px = img => { const cv = new OffscreenCanvas(W, H), cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); return cx.getImageData(0, 0, W, H).data }
      const A = px(ia), B = px(ib)
      const heat = new OffscreenCanvas(W, H), hx = heat.getContext('2d'), hd = hx.createImageData(W, H)
      let max = 0, sum = 0, over8 = 0, over32 = 0
      for (let i = 0; i < A.length; i += 4) {
        const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]))
        max = Math.max(max, d); sum += d; d > 8 && over8++; d > 32 && over32++
        hd.data[i] = Math.min(255, d * 4); hd.data[i + 1] = 0; hd.data[i + 2] = 0; hd.data[i + 3] = 255
      }
      hx.putImageData(hd, 0, 0)
      const blob = await heat.convertToBlob()
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const heat64 = btoa(bin)
      const n = A.length / 4
      return { max, mean: +(sum / n).toFixed(3), over8: +(100 * over8 / n).toFixed(3), over32: +(100 * over32 / n).toFixed(3), heat64 }
    }, [live.toString('base64'), baked.toString('base64')])
    fs.writeFileSync(path.join(OUT, name + '-live.png'), live)
    fs.writeFileSync(path.join(OUT, name + '-baked.png'), baked)
    fs.writeFileSync(path.join(OUT, name + '-diff.png'), Buffer.from(diff.heat64, 'base64'))
    delete diff.heat64
    report.push({ name, ...diff, errors: errors.splice(0) })
  }
  await ctx.close()
}
await b.close()
console.table(report)
console.log('images in', OUT)
