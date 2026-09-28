import * as SD from "../board/sea_depth.js"
import { STORAGE_KEYS as KEYS } from "../const.js"

/** Board px per cell of the depth grid. The coast foam band is ~8px wide, so no coarser. */
const CELL = 6

/** Board px per pixel of the water canvas: soft ripple strokes, and a texture a phone can hold. */
const RES = 3

/** Redraws per second while the water moves. The motion is slow; 30 is plenty. */
const FPS = 30

const svgImage = s => `data:image/svg+xml,${encodeURIComponent(s)}`

/** Two ripple tiles, each drifting exactly one period per `dur` seconds, so the loop has no seam. */
const RIPPLES = [
  {
    p: 180, dur: 26, dx: -1, dy: -1,
    src: svgImage(`<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' fill='none' stroke='#000' stroke-width='2.4' stroke-linecap='round'>
      <path d='M14 30q10-7 20 0t20 0'/><path d='M104 16q8-5 16 0t16 0'/><path d='M60 78q12-8 24 0t24 0'/>
      <path d='M140 100q8-5 16 0'/><path d='M8 126q10-6 20 0t20 0'/><path d='M92 150q10-7 20 0t20 0'/></svg>`),
  },
  {
    p: 240, dur: 38, dx: 1, dy: -1,
    src: svgImage(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' fill='none' stroke='#000' stroke-width='1.6' stroke-linecap='round'>
      <path d='M30 60q14-8 28 0'/><path d='M150 40q12-7 24 0t24 0'/><path d='M90 130q16-9 32 0'/>
      <path d='M190 170q10-6 20 0'/><path d='M20 200q14-8 28 0t28 0'/></svg>`),
  },
]

const ease = t => .5 - .5 * Math.cos(Math.PI * Math.min(Math.max(t, 0), 1))
/** The foam line's gentle breathing over 5 s, between .18 and .32. */
const coastOpacity = s => { const t = (s / 5) % 1; return t < .6 ? .18 + .14 * ease(t / .6) : .32 - .14 * ease((t - .6) / .4) }
/** The swell over 8 s: up to .2 at 40%, gone again at 80%, then rests. */
const swellOpacity = s => { const t = (s / 8) % 1; return t < .4 ? .2 * ease(t / .4) : t < .8 ? .2 * (1 - ease((t - .4) / .4)) : 0 }
/** Zoomed far out the ripple strokes shrink into a moiré hatch: full above 40% zoom, gone at 20%. */
const rippleOpacity = scale => .8 * Math.min(Math.max((scale - .2) / .2, 0), 1)

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
 * The game board's water: depth from the coast, drifting ripples, coast foam and swell, drawn into
 * one canvas inside `.board` so it pans and zooms with it. The maths lives in `sea_depth.js`.
 *
 * One canvas, redrawn by script, rather than CSS layers: every animated or masked layer under the
 * board forces the browser to split the board into more composited layers, each rasterised at
 * zoom x pixel ratio. On Chromium phones that ran past the GPU budget during a pinch and layers
 * blinked. A single canvas is one fixed-size texture the compositor only scales.
 *
 * The pieces are prepared once (depth colours, a "veil" in the depth colour whose alpha hides the
 * ripples away from the coast, the foam and swell) and composited each frame with the ripple
 * patterns in between. Drawing pauses while the board is zooming, blurred or hidden, and under
 * reduced motion, and runs at most {@link FPS} times a second.
 *
 * The board renders first with its plain sea; the depth field is computed afterwards, in slices,
 * and the water fades in over it. Turning the effect off restores the plain sea exactly.
 */
export default class WaterUI {
  #enabled = true
  #$board = null
  #$canvas = null
  #layers = null
  #grid = null
  #field = null
  #job = 0
  #h4x = false
  #raf = 0
  #lastDraw = 0
  #lastScale = 0
  #scaleChangedAt = 0
  #still = matchMedia('(prefers-reduced-motion: reduce)')

  constructor() {
    try { this.#enabled = localStorage.getItem(KEYS.WATER_FX) !== '0' } catch (e) {}
    new MutationObserver(() => {
      if (isGodMode() === this.#h4x || !this.#layers) return
      this.#paint()
      this.#apply()
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }

  get enabled() { return this.#enabled }

  /** Call after every `BoardUI.render()`: that replaces the board's contents, water included. */
  attach($board) {
    this.#$board = $board
    this.#$canvas = this.#layers = this.#field = this.#grid = null
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
    // Next frame, so the canvas starts from opacity 0 and fades in
    requestAnimationFrame(() => this.#$canvas?.classList.add('shown'))
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
    const canvas = (w, h) => {
      const $c = document.createElement('canvas')
      $c.width = w
      $c.height = h
      return $c
    }
    const $canvas = canvas(Math.ceil(width / RES), Math.ceil(height / RES))
    $canvas.className = 'wfx-water'
    Object.assign($canvas.style, { left: `${minX}px`, top: `${minY}px`, width: `${width}px`, height: `${height}px` })
    this.#layers = {
      depth: canvas(cols, rows),
      veil: canvas(cols, rows),
      coast: canvas(cols, rows),
      swell: canvas(cols, rows),
      // One tile per ripple pattern, at the water canvas's resolution
      ripples: RIPPLES.map((r, i) => ({ ...r, img: patterns[i], tile: canvas(Math.round(r.p / RES), Math.round(r.p / RES)) })),
    }
    this.#$board.prepend($canvas)
    this.#$canvas = $canvas
  }

  /** Everything that depends on the colours: repainted when god mode switches. */
  #paint() {
    const { cols, rows, W, minX, minY } = this.#grid
    const L = this.#layers
    this.#h4x = isGodMode()
    const ink = this.#h4x ? INK.h4x : INK.plain
    const stops = SD.waterStops({ h4x: this.#h4x })
    const toTiles = CELL / W

    const images = ['depth', 'veil', 'coast', 'swell'].map(k => {
      const ctx = L[k].getContext('2d')
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
        // Opaque where ripples must not show: the ripples vanish into the identical colour beneath
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

    // Ripple tiles: the pattern's strokes cut out of a sheet of the highlight colour
    for (const r of L.ripples) {
      const ctx = r.tile.getContext('2d')
      ctx.clearRect(0, 0, r.tile.width, r.tile.height)
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(r.img, 0, 0, r.tile.width, r.tile.height)
      ctx.globalCompositeOperation = 'source-in'
      const [cr, cg, cb, ca] = ink.hi
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${ca})`
      ctx.fillRect(0, 0, r.tile.width, r.tile.height)
      ctx.globalCompositeOperation = 'source-over'
      r.pattern = this.#$canvas.getContext('2d').createPattern(r.tile, 'repeat')
    }
    this.#draw(performance.now())
  }

  /** Composite one frame: depth, ripples at time `now`, veil, foam, swell. */
  #draw(now) {
    const ctx = this.#$canvas.getContext('2d')
    const { width: w, height: h } = this.#$canvas
    const L = this.#layers, s = now / 1000
    ctx.globalAlpha = 1
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(L.depth, 0, 0, w, h)
    ctx.globalAlpha = rippleOpacity(this.#scale())
    if (ctx.globalAlpha > 0) {
      for (const r of L.ripples) {
        const shift = ((s / r.dur) % 1) * r.tile.width
        r.pattern.setTransform(new DOMMatrix().translate(r.dx * shift, r.dy * shift))
        ctx.fillStyle = r.pattern
        ctx.fillRect(0, 0, w, h)
      }
    }
    ctx.globalAlpha = 1
    ctx.drawImage(L.veil, 0, 0, w, h)
    ctx.globalAlpha = coastOpacity(s)
    ctx.drawImage(L.coast, 0, 0, w, h)
    if (!this.#still.matches) {
      ctx.globalAlpha = swellOpacity(s)
      ctx.drawImage(L.swell, 0, 0, w, h)
    }
    ctx.globalAlpha = 1
    this.#lastDraw = now
  }

  #scale() { return +this.#$board.style.getPropertyValue('--board-scale') || 1 }

  /** Redraw loop: at most FPS, and never while zooming, blurred or under reduced motion. */
  #tick = now => {
    this.#raf = requestAnimationFrame(this.#tick)
    const scale = this.#scale()
    if (scale !== this.#lastScale) { this.#lastScale = scale; this.#scaleChangedAt = now; return }
    if (now - this.#scaleChangedAt < 250) return
    if (now - this.#lastDraw < 1000 / FPS - 2) return
    if (this.#still.matches || this.#$board.classList.contains('blur')) {
      // One settled frame (ripple fade for the new zoom), then stay still
      if (this.#scaleChangedAt > this.#lastDraw) this.#draw(now)
      return
    }
    this.#draw(now)
  }

  #apply() {
    const on = this.#enabled && !!this.#$canvas
    this.#$board?.classList.toggle('wfx', on)
    if (this.#$canvas) this.#$canvas.hidden = !on
    cancelAnimationFrame(this.#raf)
    if (on) this.#raf = requestAnimationFrame(this.#tick)
    const root = document.documentElement.style
    if (on) {
      const deep = SD.waterStops({ h4x: isGodMode() }).at(-1).map(Math.round)
      root.setProperty('--water-color', `rgb(${deep.join(' ')})`)
    } else {
      root.removeProperty('--water-color')
    }
  }
}
