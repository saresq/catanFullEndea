import * as SD from "../board/sea_depth.js"
import { STORAGE_KEYS as KEYS } from "../const.js"

/** Board px per cell of the depth grid. The coast foam band is ~8px wide, so no coarser. */
const CELL = 6

/** Board px per pixel of the ripple canvases: soft strokes, and a texture a phone can hold. */
const RIPPLE_RES = 3

const svgImage = s => `data:image/svg+xml,${encodeURIComponent(s)}`

/** Two ripple tiles; each canvas drifts exactly one period per loop, so the loop has no seam. */
const RIPPLES = [
  {
    p: 180, dur: 26, dx: -180, dy: -180,
    src: svgImage(`<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' fill='none' stroke='#000' stroke-width='2.4' stroke-linecap='round'>
      <path d='M14 30q10-7 20 0t20 0'/><path d='M104 16q8-5 16 0t16 0'/><path d='M60 78q12-8 24 0t24 0'/>
      <path d='M140 100q8-5 16 0'/><path d='M8 126q10-6 20 0t20 0'/><path d='M92 150q10-7 20 0t20 0'/></svg>`),
  },
  {
    p: 240, dur: 38, dx: 240, dy: -240,
    src: svgImage(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' fill='none' stroke='#000' stroke-width='1.6' stroke-linecap='round'>
      <path d='M30 60q14-8 28 0'/><path d='M150 40q12-7 24 0t24 0'/><path d='M90 130q16-9 32 0'/>
      <path d='M190 170q10-6 20 0'/><path d='M20 200q14-8 28 0t28 0'/></svg>`),
  },
]

/** Ripple and foam colours as [r, g, b, alpha]; god mode swaps in the H4x0r cyan. */
const INK = {
  plain: { hi: [230, 245, 255, .42], foam: [242, 249, 253, 1] },
  h4x: { hi: [1, 186, 239, .55], foam: [1, 186, 239, 1] },
}

const isGodMode = () => document.documentElement.classList.contains('godmode')

const loadImage = src => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = src
})

/**
 * The game board's water: depth from the coast, drifting ripples, coast foam and swell, drawn as
 * layers inside `.board` so they pan and zoom with it. The maths lives in `sea_depth.js`.
 *
 * Every layer is a small canvas, never a CSS mask: a phone's compositor scales a canvas texture
 * for free on pinch-zoom, while masked or huge promoted layers get re-rasterised at every zoom
 * step (and past the GPU's texture size, dropped). Ripples are shown near the coast by a "veil"
 * canvas above them, painted in the depth colour with the inverse of the ripple strength as alpha:
 * where the veil is opaque the ripples vanish into the water beneath, exactly like a mask.
 *
 * The board renders first with its plain sea; the depth field is computed afterwards, in slices,
 * and the water fades in over it. Turning the effect off restores the plain sea exactly.
 */
export default class WaterUI {
  #enabled = true
  #$board = null
  #$water = null
  #canvases = null
  #grid = null
  #field = null
  #job = 0
  #h4x = false

  constructor() {
    try { this.#enabled = localStorage.getItem(KEYS.WATER_FX) !== '0' } catch (e) {}
    new MutationObserver(() => {
      if (isGodMode() === this.#h4x || !this.#canvases) return
      this.#paint()
      this.#apply()
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }

  get enabled() { return this.#enabled }

  /** Call after every `BoardUI.render()`: that replaces the board's contents, water included. */
  attach($board) {
    this.#$board = $board
    this.#$water = this.#canvases = this.#field = this.#grid = null
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
    const [field, ...patterns] = await Promise.all([
      SD.computeField(grid, { isCancelled: () => job !== this.#job }),
      ...RIPPLES.map(r => loadImage(r.src)),
    ])
    if (!field || job !== this.#job) return
    this.#grid = grid
    this.#field = field
    this.#createLayers(patterns)
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

  #createLayers(patterns) {
    const { minX, minY, cols, rows } = this.#grid
    const width = cols * CELL, height = rows * CELL
    const $water = document.createElement('div')
    $water.className = 'wfx-water'
    Object.assign($water.style, { left: `${minX}px`, top: `${minY}px`, width: `${width}px`, height: `${height}px` })

    /** A canvas of `w` x `h` pixels shown at the full water size (or `cssW` x `cssH` board px). */
    const canvas = (cls, w = cols, h = rows) => {
      const $c = document.createElement('canvas')
      $c.className = cls
      $c.width = w
      $c.height = h
      return $c
    }
    const ripples = RIPPLES.map((r, i) => {
      // One period of overhang on every side, so the drift never uncovers an edge
      const cssW = width + 2 * r.p, cssH = height + 2 * r.p
      const $c = canvas(`wfx-ripple ${i ? 'b' : 'a'}`, Math.ceil(cssW / RIPPLE_RES), Math.ceil(cssH / RIPPLE_RES))
      Object.assign($c.style, { left: `${-r.p}px`, top: `${-r.p}px`, width: `${cssW}px`, height: `${cssH}px` })
      $c.style.setProperty('--dx', `${r.dx}px`)
      $c.style.setProperty('--dy', `${r.dy}px`)
      $c.style.setProperty('--dur', `${r.dur}s`)
      return { $c, img: patterns[i] }
    })
    this.#canvases = {
      depth: canvas('wfx-depth'),
      ripples,
      veil: canvas('wfx-veil'),
      coast: canvas('wfx-coast'),
      swell: canvas('wfx-swell'),
    }
    const c = this.#canvases
    $water.append(c.depth, ...ripples.map(r => r.$c), c.veil, c.coast, c.swell)
    this.#$board.prepend($water)
    this.#$water = $water
  }

  /** Everything that depends on the colours: repainted when god mode switches. */
  #paint() {
    const { cols, rows, W, minX, minY } = this.#grid
    const c = this.#canvases
    this.#h4x = isGodMode()
    const ink = this.#h4x ? INK.h4x : INK.plain
    const stops = SD.waterStops({ h4x: this.#h4x })
    const toTiles = CELL / W

    const images = ['depth', 'veil', 'coast', 'swell'].map(k => {
      const ctx = c[k].getContext('2d')
      return { ctx, img: ctx.createImageData(cols, rows) }
    })
    const [depth, veil, coast, swell] = images.map(i => i.img.data)
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i, k = idx * 4
        const d = this.#field[idx]
        const edge = Math.min(i, cols - 1 - i, j, rows - 1 - j) * toTiles
        const x = minX + (i + .5) * CELL, y = minY + (j + .5) * CELL
        const [r, g, b] = SD.rampColor(stops, SD.depthAt(d, edge))
        // A little dither keeps the long, slow gradient free of bands
        const dither = Math.random() - .5
        depth[k] = veil[k] = r + dither
        depth[k + 1] = veil[k + 1] = g + dither
        depth[k + 2] = veil[k + 2] = b + dither
        depth[k + 3] = 255
        veil[k + 3] = 255 * (1 - SD.shoreAlpha(d, edge))
        for (const [data, a] of [[coast, SD.coastAlpha(d, x, y)], [swell, SD.swellAlpha(d, x, y)]]) {
          data[k] = ink.foam[0]
          data[k + 1] = ink.foam[1]
          data[k + 2] = ink.foam[2]
          data[k + 3] = 255 * a
        }
      }
    }
    images.forEach(({ ctx, img }) => ctx.putImageData(img, 0, 0))

    // Ripples: the pattern's strokes cut out of a sheet of the highlight colour
    for (const [i, { $c, img }] of c.ripples.entries()) {
      const ctx = $c.getContext('2d')
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, $c.width, $c.height)
      const pattern = ctx.createPattern(img, 'repeat')
      pattern.setTransform(new DOMMatrix().scale(1 / RIPPLE_RES))
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, $c.width, $c.height)
      ctx.globalCompositeOperation = 'source-in'
      const [r, g, b, a] = ink.hi
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`
      ctx.fillRect(0, 0, $c.width, $c.height)
      ctx.globalCompositeOperation = 'source-over'
    }
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
