import * as SD from "../board/sea_depth.js"
import { STORAGE_KEYS as KEYS } from "../const.js"

/** Board px per cell of the depth grid. The coast foam band is ~8px wide, so no coarser. */
const CELL = 6

const svg = s => `url("data:image/svg+xml,${encodeURIComponent(s)}")`

/** Two ripple tiles used as masks over `--wfx-hi`; each drifts exactly one period per loop. */
const RIPPLES = [
  {
    p: 180, dur: 26, dx: -180, dy: -180,
    img: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' fill='none' stroke='#000' stroke-width='2.4' stroke-linecap='round'>
      <path d='M14 30q10-7 20 0t20 0'/><path d='M104 16q8-5 16 0t16 0'/><path d='M60 78q12-8 24 0t24 0'/>
      <path d='M140 100q8-5 16 0'/><path d='M8 126q10-6 20 0t20 0'/><path d='M92 150q10-7 20 0t20 0'/></svg>`),
  },
  {
    p: 240, dur: 38, dx: 240, dy: -240,
    img: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' fill='none' stroke='#000' stroke-width='1.6' stroke-linecap='round'>
      <path d='M30 60q14-8 28 0'/><path d='M150 40q12-7 24 0t24 0'/><path d='M90 130q16-9 32 0'/>
      <path d='M190 170q10-6 20 0'/><path d='M20 200q14-8 28 0t28 0'/></svg>`),
  },
]

const isGodMode = () => document.documentElement.classList.contains('godmode')

/**
 * The game board's water: depth from the coast, drifting ripples, coast foam and swell, drawn as
 * layers inside `.board` so they pan and zoom with it. The maths lives in `sea_depth.js`.
 *
 * The board renders first with its plain sea; the depth field is computed afterwards, in slices,
 * and the water fades in over it. Turning the effect off restores the plain sea exactly.
 */
export default class WaterUI {
  #enabled = true
  #$board = null
  #$water = null
  #$canvas = null
  #grid = null
  #field = null
  #job = 0
  #h4x = false

  constructor() {
    try { this.#enabled = localStorage.getItem(KEYS.WATER_FX) !== '0' } catch (e) {}
    new MutationObserver(() => {
      if (isGodMode() === this.#h4x || !this.#field) return
      this.#paint()
      this.#apply()
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }

  get enabled() { return this.#enabled }

  /** Call after every `BoardUI.render()`: that replaces the board's contents, water included. */
  attach($board) {
    this.#$board = $board
    this.#$water = this.#$canvas = this.#field = this.#grid = null
    this.#job++
    this.#apply()
    if (this.#enabled) this.#build()
  }

  setEnabled(on) {
    this.#enabled = !!on
    try { localStorage.setItem(KEYS.WATER_FX, on ? '1' : '0') } catch (e) {}
    this.#apply()
    if (on && !this.#field) this.#build()
  }

  async #build() {
    const job = ++this.#job
    // After the board's first paint, so the water never delays it
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
    if (job !== this.#job || !this.#$board) return
    const grid = this.#measure()
    if (!grid) return
    const field = await SD.computeField(grid, { isCancelled: () => job !== this.#job })
    if (!field || job !== this.#job) return
    this.#grid = grid
    this.#field = field
    this.#createLayers()
    this.#paint()
    this.#apply()
    // Next frame, so the layers start from opacity 0 and fade in
    requestAnimationFrame(() => this.#$water?.classList.add('shown'))
  }

  /** Tile centres from the rendered board, so nothing re-derives `board_ui`'s row offsets. */
  #measure() {
    const tiles = [...this.#$board.querySelectorAll('.row > .tile')].map($t => {
      const $row = $t.parentElement
      return {
        land: !$t.classList.contains('S'),
        x: $row.offsetLeft + $t.offsetLeft + $t.offsetWidth / 2,
        y: $row.offsetTop + $t.offsetTop + $t.offsetHeight / 2,
        w: $t.offsetWidth,
      }
    })
    const land = tiles.filter(t => t.land)
    if (!land.length) return null
    const row0 = tiles.filter(t => t.y === tiles[0].y)
    const W = row0.length > 1 ? Math.abs(row0[1].x - row0[0].x) : tiles[0].w - 2
    const margin = SD.MARGIN * W
    const minX = Math.min(...tiles.map(t => t.x)) - W / 2 - margin
    const minY = Math.min(...tiles.map(t => t.y)) - W / Math.sqrt(3) - margin
    const maxX = Math.max(...tiles.map(t => t.x)) + W / 2 + margin
    const maxY = Math.max(...tiles.map(t => t.y)) + W / Math.sqrt(3) + margin
    return {
      land, W, minX, minY, cell: CELL,
      cols: Math.ceil((maxX - minX) / CELL), rows: Math.ceil((maxY - minY) / CELL),
    }
  }

  #createLayers() {
    const { minX, minY, cols, rows } = this.#grid
    const $water = document.createElement('div')
    $water.className = 'wfx-water'
    Object.assign($water.style, {
      left: `${minX}px`, top: `${minY}px`, width: `${cols * CELL}px`, height: `${rows * CELL}px`,
    })

    const $canvas = document.createElement('canvas')
    $canvas.className = 'wfx-depth'
    $canvas.width = cols
    $canvas.height = rows

    // Styles carrying data: URLs go through the style API: the SVG's quotes break a style="" string
    const masked = (cls, mask) => {
      const $el = document.createElement('div')
      $el.className = `wfx-masked ${cls}`
      $el.style.setProperty('-webkit-mask-image', mask)
      $el.style.setProperty('mask-image', mask)
      return $el
    }
    const $ripples = masked('wfx-ripples', this.#maskUrl(SD.shoreAlpha))
    $ripples.append(...RIPPLES.map(p => {
      const $p = document.createElement('div')
      $p.className = 'wfx-pat'
      const props = { '--p': `${p.p}px`, '--dur': `${p.dur}s`, '--dx': `${p.dx}px`, '--dy': `${p.dy}px`,
        '-webkit-mask-image': p.img, 'mask-image': p.img }
      for (const [k, v] of Object.entries(props)) $p.style.setProperty(k, v)
      return $p
    }))

    $water.append(
      $canvas,
      $ripples,
      masked('wfx-foam coast', this.#maskUrl(SD.coastAlpha)),
      masked('wfx-foam swell', this.#maskUrl(SD.swellAlpha)),
    )
    this.#$board.prepend($water)
    this.#$water = $water
    this.#$canvas = $canvas
  }

  /** An alpha mask from the field, white where the effect shows. */
  #maskUrl(alphaOf) {
    const { cols, rows, minX, minY } = this.#grid
    const c = document.createElement('canvas')
    c.width = cols
    c.height = rows
    const ctx = c.getContext('2d'), img = ctx.createImageData(cols, rows), data = img.data
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = (j * cols + i) * 4
        data[k] = data[k + 1] = data[k + 2] = 255
        data[k + 3] = 255 * alphaOf(this.#field[j * cols + i], minX + (i + .5) * CELL, minY + (j + .5) * CELL)
      }
    }
    ctx.putImageData(img, 0, 0)
    return `url(${c.toDataURL()})`
  }

  #paint() {
    const { cols, rows, W } = this.#grid
    this.#h4x = isGodMode()
    const stops = SD.waterStops({ h4x: this.#h4x })
    const ctx = this.#$canvas.getContext('2d'), img = ctx.createImageData(cols, rows), data = img.data
    const toTiles = CELL / W
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i
        const edge = Math.min(i, cols - 1 - i, j, rows - 1 - j) * toTiles
        const [r, g, b] = SD.rampColor(stops, SD.depthAt(this.#field[idx], edge))
        // A little dither keeps the long, slow gradient free of bands
        const dither = Math.random() - .5
        data[idx * 4] = r + dither
        data[idx * 4 + 1] = g + dither
        data[idx * 4 + 2] = b + dither
        data[idx * 4 + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }

  #apply() {
    const on = this.#enabled && !!this.#$water
    this.#$board?.classList.toggle('wfx', on)
    if (this.#$water) this.#$water.hidden = !on
    const root = document.documentElement.style
    if (on) {
      const deep = SD.waterStops({ h4x: isGodMode() }).at(-1).map(Math.round)
      root.setProperty('--water-color', `rgb(${deep.join(' ')})`)
    } else {
      root.removeProperty('--water-color')
    }
  }
}
