/**
 * How deep the water is: distance from the nearest land hex, and the colours and effect masks
 * that follow from it.
 *
 * DOM-free so it can be tested under `node --test`: `board_ui.js` binds `document.querySelector`
 * at module scope and cannot be imported outside a browser. `water_ui.js` does the drawing.
 *
 * Distances are in tile widths (`W`, centre to centre along a row), measured to the land hexes'
 * edges: negative on land, 0 on the coast, positive at sea.
 */

/** Coast to open ocean. The last stop is also the page background, so the water has no edge. */
export const ENDEA_BLUE = ['#7fbcd4', '#64a9cc', '#4f98c3', '#3f87b8', '#3478aa', '#2c6b9c']

/**
 * How far the shallows stand out from open water: 1 is the palette as written, lower pulls every
 * stop towards the last one, so the coast glows less without changing the hue.
 */
export const GLOW = .7

/** God mode: each stop's brightness factor runs from `shore` at the coast to `deep` in open ocean. */
export const H4X_DARKEN = { shore: .42, deep: .03 }

/** Tile widths per step of {@link depthCurve}. */
export const FALLOFF = .9

/** Tile widths of water drawn around the board, and the last stretch of it that blends to open ocean. */
export const MARGIN = 4.5
export const EDGE_BLEND = 1.5

const KX = -0.866025404, KY = 0.5, KZ = 0.577350269

/** Exact signed distance to a pointy-top hexagon of inradius `a` (iq's sdHexagon with the axes swapped). */
export function sdHex(px, py, a) {
  let x = Math.abs(py), y = Math.abs(px)
  const d = 2 * Math.min(KX * x + KY * y, 0)
  x -= d * KX; y -= d * KY
  x -= Math.min(Math.max(x, -KZ * a), KZ * a)
  y -= a
  return Math.hypot(x, y) * Math.sign(y)
}

/**
 * A plain min() leaves a visible crease where two coasts are equally far; a smooth min rounds it.
 * Its width grows with the distance, so the coast itself stays exact and only open water blends.
 */
export function smin(a, b, W) {
  const m = Math.min(a, b)
  const k = Math.max(.15 * W, .5 * m)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return m - h * h * k / 4
}

/**
 * 0 at the coast, approaching 1 in open ocean: soft off the coast, then a long tail (~0.65 at 2
 * tiles, ~0.9 at 3.5). A curve that lands at a fixed distance reads as a halo with a rim when
 * zoomed out.
 */
export function depthCurve(d) {
  const x = Math.max(d, 0) / FALLOFF
  return 1 - (1 + x) * Math.exp(-x)
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * Depth for colouring: the curve, forced to exactly 1 over the last {@link EDGE_BLEND} tiles
 * before the edge of the drawn water, where it meets the page background.
 * @param {number} d distance to land, @param {number} edge distance to the drawn edge, both in tiles
 */
export function depthAt(d, edge) {
  return 1 - (1 - depthCurve(d)) * smoothstep(0, EDGE_BLEND, edge)
}

export const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))

/** The palette as RGB triplets, with the glow pull and, in god mode, the darkening applied. */
export function waterStops({ h4x = false } = {}) {
  const raw = ENDEA_BLUE.map(hexRgb), deep = raw[raw.length - 1]
  const stops = raw.map(c => c.map((v, j) => deep[j] + (v - deep[j]) * GLOW))
  if (!h4x) return stops
  return stops.map((c, i) => {
    const k = H4X_DARKEN.shore + (H4X_DARKEN.deep - H4X_DARKEN.shore) * (i / (stops.length - 1))
    return c.map(v => v * k)
  })
}

/** Linear ramp through `stops` for `t` in [0, 1]. */
export function rampColor(stops, t) {
  t = Math.min(Math.max(t, 0), 1) * (stops.length - 1)
  const i = Math.min(Math.floor(t), stops.length - 2), f = t - i
  const a = stops[i], b = stops[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

/** Cheap deterministic noise in board px, so foam breaks up the same way on every render. */
export const noise = (x, y) =>
  .5 + .25 * Math.sin(x * .031 + Math.sin(y * .017) * 2.1) + .25 * Math.sin(y * .027 + Math.sin(x * .013) * 1.7)

/**
 * Ripple strength: full at the coast, a fifth of it about three tiles out, none on land, and none
 * at the edge of the drawn water: the page background beyond it has no ripples, so any left there
 * outline the water as a lighter box when zoomed out.
 * @param {number} d distance to land, @param {number} edge distance to the drawn edge, both in tiles
 */
export const shoreAlpha = (d, edge) =>
  d < -.05 ? 0 : (1 - .8 * smoothstep(0, 2.8, d)) * smoothstep(0, EDGE_BLEND + 1, edge)

/** The foam line just outside the beaches, uneven along the coast. */
export const coastAlpha = (d, x, y) => Math.exp(-(((d - .14) / .05) ** 2)) * (.6 + .4 * noise(x, y))

/** The swell line a third of a tile out, broken into fragments. */
export const swellAlpha = (d, x, y) =>
  Math.exp(-(((d - .36) / .06) ** 2)) * smoothstep(.5, .8, noise(x * .7 + 40, y * .7))

/**
 * Distance to land for every cell of a grid, in tile widths.
 *
 * Yields to the event loop every ~10 ms, so a big map on a slow phone never stalls the page.
 *
 * @param {{ land: {x: number, y: number}[], W: number, minX: number, minY: number,
 *   cols: number, rows: number, cell: number }} grid cell `(i, j)` is centred at
 *   `(minX + (i + .5) * cell, minY + (j + .5) * cell)`, in board px
 * @param {{ sliceMs?: number, isCancelled?: () => boolean }} [opts]
 * @returns {Promise<Float32Array | null>} null when cancelled
 */
export async function computeField({ land, W, minX, minY, cols, rows, cell }, opts = {}) {
  const { sliceMs = 10, isCancelled = () => false } = opts
  const field = new Float32Array(cols * rows)
  const inr = W / 2, circ = W / Math.sqrt(3)
  const now = () => (globalThis.performance ?? Date).now()
  let sliceStart = now()
  for (let j = 0; j < rows; j++) {
    if (now() - sliceStart > sliceMs) {
      await new Promise(r => setTimeout(r, 0))
      if (isCancelled()) return null
      sliceStart = now()
    }
    const y = minY + (j + .5) * cell
    for (let i = 0; i < cols; i++) {
      const x = minX + (i + .5) * cell
      let best = Infinity
      for (const t of land) {
        const dx = x - t.x, dy = y - t.y
        if (Math.hypot(dx, dy) - circ > best + Math.max(W, .5 * best)) continue
        const d = sdHex(dx, dy, inr)
        best = best === Infinity ? d : smin(best, d, W)
      }
      field[j * cols + i] = land.length ? best / W : Infinity
    }
  }
  return field
}
