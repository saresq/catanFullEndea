/**
 * Pre-rendered board pieces.
 *
 * Live, a piece is its grey SVG laid over the player colour with the hard-light blend, masked to its
 * own silhouette, with the drop-shadows (and on civilization pieces the outline) as CSS filters on
 * the element (constants.css, board.css). That is an off-screen pass per effect per piece, and a
 * phone redoes them all for every piece on every frame of a pinch-zoom.
 *
 * Here each player's pieces are baked once into one SVG each: the greys already blended with the
 * player colour (the same hard-light formula, per colour, so the faces come out identical), and the
 * same outline and shadows as the CSS chain, rebuilt from the art's silhouette (bakeSvg).
 * The board then shows a plain image: no mask, no blend, no filter (board.css, `.board.baked`).
 * Pieces in a highlight state (click target, Longest Road) fall back to the live art, since those
 * states replace the filter chain.
 *
 * Board geometry, in the element's own px (filters and art are laid out there, before the board's
 * zoom): corners are 30px (settlement) or 48px (city) squares with the art in the box; roads are a
 * 7 x 50 bar with the art in a 22 x 62 box around it.
 */

/** Room around the art box for the shadows and the outline, in px, each side */
export const MARGIN = 20

const SHADOW = [[-1, 1.5, .6, 'rgb(0 0 0 / .58)'], [-4, 4.8, 2.75, 'rgb(0 0 0 / .74)']]
const OUTLINE = [[.5, 0], [-.5, 0], [0, .5], [0, -.5]].map(([x, y]) => [x, y, 0, 'rgb(0 0 0 / .55)'])
/** Each road angle: its art, its shadow (board.css --road-shadow) and which data-dir values use it */
const ROADS = {
  0: { dirs: ['right', 'left'], shadow: [[-.5, 1, .5, 'rgb(0 0 0 / .42)'], [-2.4, 3.2, 1.65, 'rgb(0 0 0 / .7)']] },
  60: { dirs: ['bottom-right', 'top-left'], shadow: [[.62, .93, .5, 'rgb(0 0 0 / .42)'], [1.57, 3.68, 1.65, 'rgb(0 0 0 / .7)']] },
  120: { dirs: ['bottom-left', 'top-right'], shadow: [[1.12, -.07, .5, 'rgb(0 0 0 / .42)'], [3.97, .48, 1.65, 'rgb(0 0 0 / .7)']] },
}
const CORNER = { S: 30, C: 48 }
const ROAD_BOX = { x: -7.5, y: -6, w: 22, h: 62 }

const parseHex = hex => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
}
const toHex = rgb => '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')

/**
 * CSS `hard-light`, the art (source) over the player colour (backdrop), per channel:
 * multiply by 2Cs below mid grey, screen with 2Cs - 1 above it.
 */
export function hardLight(art_hex, colour_hex) {
  const s = parseHex(art_hex), b = parseHex(colour_hex)
  return toHex(s.map((cs, i) => cs <= .5 ? b[i] * 2 * cs : b[i] + (2 * cs - 1) - b[i] * (2 * cs - 1)))
}

/** Every colour the art paints with (fills, strokes, gradient stops) blended with `colour_hex` */
export function tintSvg(svg, colour_hex) {
  return svg.replace(/(fill|stroke|stop-color)="(#[0-9a-f]{6}|#[0-9a-f]{3})"/gi, (_, attr, hex) => `${attr}="${hardLight(hex, colour_hex)}"`)
}

/** The art's silhouette: every paint (colours and gradients) black, alpha kept. Its ids are
    renamed, so the art's own gradients never resolve to this copy's. */
const blacken = svg => svg.replace(/(fill|stroke)="(#[0-9a-f]{3,6}|url\([^)]*\))"/gi, '$1="#000"').replace(/\bid="/g, 'id="sil-')

/**
 * One baked piece. `box` is where the art sits in the element's px (CSS `contain`, centred);
 * the image covers it plus MARGIN each side, which is where board.css puts the ::before.
 *
 * The CSS chain `drop-shadow(a) drop-shadow(b) …` shadows, at each step, everything drawn so far:
 * step k+1 is the black silhouette of (art + shadows 1..k), offset, blurred (standard deviation =
 * the blur length: a filter's drop-shadow does not halve it, unlike box-shadow) and faded to the
 * colour's alpha. Built the same way here from the silhouette, so the art itself is drawn plain and
 * sharp on top, and only the shadows go through a filter (a blur; none for the 0-blur outline).
 *
 * Offsets are floored to whole px because that is how the browser the look was picked in (Chrome)
 * draws a filter's drop-shadow: a .5px outline shows as 1px to the left and top only, and the
 * tests/visual/piece_art_check.js diff against the live art is only anti-aliasing that way.
 */
export function bakeSvg(svg, colour_hex, box, shadows) {
  const vb = svg.match(/viewBox="([^"]+)"/)[1]
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<!--[\s\S]*?-->/g, '')
  const x = box.x - MARGIN, y = box.y - MARGIN, w = box.w + 2 * MARGIN, h = box.h + 2 * MARGIN
  const place = `x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet"`
  const defs = [`<svg id="sil0" ${place}>${blacken(inner)}</svg>`]
  shadows.forEach(([dx, dy, r, colour], k) => {
    const alpha = +(colour.match(/\/\s*([\d.]+)/)?.[1] ?? 1)
    const blur = r ? ` filter="url(#b${k})"` : ''
    r && defs.push(`<filter id="b${k}" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><feGaussianBlur stdDeviation="${r}"/></filter>`)
    defs.push(`<g id="sh${k}" opacity="${alpha}"${blur}><use href="#sil${k}" transform="translate(${Math.floor(dx)} ${Math.floor(dy)})"/></g>`)
    defs.push(`<g id="sil${k + 1}"><use href="#sh${k}"/><use href="#sil${k}"/></g>`)
  })
  const layers = shadows.map((_, k) => `<use href="#sh${k}"/>`).reverse().join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">` +
    `<defs>${defs.join('')}</defs>${layers}<svg ${place}>${tintSvg(inner, colour_hex)}</svg></svg>`
}

const ART = {
  S: '/images/pieces/settlement.svg', C: '/images/pieces/city.svg',
  R0: '/images/pieces/road-0.svg', R60: '/images/pieces/road-60.svg', R120: '/images/pieces/road-120.svg',
  civ: (civ, kind) => `/images/pieces/civ/${civ}-${kind === 'S' ? 'settlement' : 'city'}.svg`,
}

export default class PieceArt {
  #$board; #colourOf; #civOf
  #texts = new Map()
  #urls = new Map() // pid -> [object URLs]
  #rules = new Map() // pid -> css text
  #$style
  #pids = []

  /**
   * @param {HTMLElement} $board  gets `.baked` once every player's art is in
   * @param {{ colourOf: (pid) => string, civOf: (pid) => string|null }} opts  colourOf: a #hex
   */
  constructor($board, { colourOf, civOf }) {
    this.#$board = $board
    this.#colourOf = colourOf
    this.#civOf = civOf
  }

  async #text(url) {
    if (!this.#texts.has(url)) this.#texts.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.text() }))
    return this.#texts.get(url)
  }

  #url(svg) { return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) }

  /** Every seat's pieces; the board switches to them when all are ready. */
  async setPlayers(pids) {
    this.#pids = pids.filter(Boolean)
    try {
      await Promise.all(this.#pids.map(pid => this.update(pid, false)))
      this.#render()
      this.#$board.classList.add('baked')
    } catch (e) {
      // The live art stays: slower on phones, same look
      console.warn('piece art', e)
    }
  }

  /** (Re)bakes one seat, after a colour change. Its old art stays up until the new one is in. */
  async update(pid, render = true) {
    const colour = this.#colourOf(pid), civ = this.#civOf(pid)
    const corner = kind => ({ x: 0, y: 0, w: CORNER[kind], h: CORNER[kind] })
    const jobs = []
    // Classic pieces as they are; with civ pieces on, the civilization's (the classic ones for a
    // seat without one) with the outline under the shadows, as board.css draws them live
    for (const kind of ['S', 'C']) {
      jobs.push(this.#text(ART[kind]).then(t => [`.board.baked .corner.taken.p${pid}[data-taken=${kind}]`, bakeSvg(t, colour, corner(kind), SHADOW)]))
      jobs.push(this.#text(civ ? ART.civ(civ, kind) : ART[kind]).then(t => [`.civ-pieces .board.baked .corner.taken.p${pid}[data-taken=${kind}]`, bakeSvg(t, colour, corner(kind), [...OUTLINE, ...SHADOW])]))
    }
    for (const [angle, { dirs, shadow }] of Object.entries(ROADS)) {
      const sel = pre => dirs.map(d => `${pre}.board.baked .edge.taken.p${pid}[data-dir="${d}"]`).join(', ')
      jobs.push(this.#text(ART['R' + angle]).then(t => [sel(''), bakeSvg(t, colour, ROAD_BOX, shadow)]))
      jobs.push(this.#text(ART['R' + angle]).then(t => [sel('.civ-pieces '), bakeSvg(t, colour, ROAD_BOX, [...OUTLINE, ...shadow])]))
    }
    const baked = await Promise.all(jobs)
    const urls = baked.map(([, svg]) => this.#url(svg))
    this.#rules.set(pid, baked.map(([sel], i) => `${sel} { --art: url("${urls[i]}"); }`).join('\n'))
    const old = this.#urls.get(pid)
    this.#urls.set(pid, urls)
    if (render) this.#render()
    // Revoke after the new rules are up, so the piece never shows without art
    old && requestAnimationFrame(() => old.forEach(u => URL.revokeObjectURL(u)))
  }

  #render() {
    if (!this.#$style) {
      this.#$style = document.createElement('style')
      this.#$style.id = 'piece-art'
      document.head.appendChild(this.#$style)
    }
    this.#$style.textContent = [...this.#rules.values()].join('\n')
  }
}
