import * as CONST from "./const.js"
import Board from "./board/board.js"
import BoardShuffler from "./board/board_shuffler.js"
import MapBuilderBoardUI from "./ui/map_builder_board_ui.js"
import AccessibilityUI from "./ui/accessibility_ui.js"
import {
  expandSeaBordersAt, growBottom, growLeft, growRight, growTop,
  parseRows, serializeRows, validateMapkey,
} from "./board/map_grid.js"

const $ = document.querySelector.bind(document)
const dummyFn = _ => _

/** 7 moves the robber, so it never goes on a tile. */
const NUMBERS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]
/** The ports a sea tile can carry. `*4` and `Px` are not places on the map. */
const PORT_OFFERS = Object.keys(CONST.TRADE_OFFERS).filter(k => !['Px', '*4'].includes(k))
const EDGES = Object.values(CONST.DIR_HELPER.KEYS)
/** Terrain brushes, in palette order: erase first, then the five resources, then desert. */
const TERRAINS = ['S', 'G', 'J', 'C', 'M', 'F', 'D']

const GROW = { top: growTop, right: growRight, bottom: growBottom, left: growLeft }
const GROW_LABEL = {
  top: 'Add a row of sea above', right: 'Add a column of sea on the right',
  bottom: 'Add a row of sea below', left: 'Add a column of sea on the left',
}

const RAIL = [
  { id: 'randomize', icon: '🎲', label: 'Randomize' },
  { id: 'balance', icon: '⚖️', label: 'Balance' },
  { id: 'info', icon: '🧭', label: 'Map info' },
  { id: 'share', icon: '🔗', label: 'Share map' },
]

/** What `Shuffle` may move around, as chips rather than three sentences starting with the same word. */
const SHUFFLE_OPTIONS = [
  { id: 'tile', label: 'Locations' },
  { id: 'number', label: 'Numbers' },
  { id: 'port', label: 'Ports' },
]

/** The number the brush writes: a real one, a fresh roll per tile, or nothing at all. */
const RANDOM = 'random'

/** Resource colours taken off the tile art, so a bar reads as the terrain it counts. */
const TERRAIN_HUE = { G: '#7fae3c', J: '#2f6b35', C: '#b4602c', M: '#8d8fa6', F: '#d8a72b', D: '#c9b37e' }

const HISTORY_DEPTH = 100

/**
 * A chip that stands for a checkbox. The mark on its left is the state - a hollow ring when off,
 * a filled tick when on - because a pill on its own reads as a button you press to do something,
 * not as a setting you leave switched on.
 */
const chipHtml = (attr, value, label, on) => `
  <button class="opt-chip btn btn--quiet btn--sm${on ? ' active' : ''}" data-${attr}="${value}"
    aria-pressed="${on}">
    <span class="chip-mark" aria-hidden="true"></span>${label}
  </button>`

/** A chip that stands for a checkbox: pressed is on. */
const toggleChip = $chip => {
  const on = $chip.getAttribute('aria-pressed') !== 'true'
  $chip.setAttribute('aria-pressed', String(on))
  $chip.classList.toggle('active', on)
}
const chipOn = (root, attr, value) =>
  root.querySelector(`[data-${attr}="${value}"]`)?.getAttribute('aria-pressed') === 'true'

/** The board's number token. `.token` carries the board's own design; the size comes from `cls`. */
const tokenHtml = (n, cls) => `
  <span class="token ${cls}${CONST.RED_NUMBERS.includes(n) ? ' red' : ''}"
    num="${n}" dots="${'.'.repeat(6 - Math.abs(7 - n))}"></span>`

/** One hexagon, for a brush chip or the port popover. Same markup the board uses for a tile. */
const tileHtml = (type, extra = '') => `
  <span class="editor-tile ${type}">
    ${type === 'S' ? '<span class="sea-hexagon"></span>' : ''}
    <span class="background"></span>
    ${extra}
  </span>`

class MapEditor {
  board; board_ui; accessibility_ui
  mapkey
  /**
   * What a press on the board does. `null` is the resting state: the board pans instead, which is
   * the guard against painting by accident on a map that is always editable.
   * @type {null | { kind: 'terrain', type: string } | { kind: 'number' } | { kind: 'port' }}
   */
  brush = null
  /**
   * The number a terrain brush carries, and what the number brush writes. `RANDOM` rolls a fresh
   * one per tile, a plain number writes that one, and `null` leaves the tile unnumbered.
   * @type {number | 'random' | null}
   */
  number = RANDOM

  #undo = []
  #redo = []
  /** One user gesture - a click or a whole drag - is one undo step. */
  #gesture = null
  #port = null
  #pointer_bound = false
  #open_popover = null
  #modal_open = false
  /** The brush being held aside while Space is down. `undefined` means Space is not down. */
  #space_brush = undefined

  $dock = $('#editor-dock')
  $float = $('#editor-float')
  $rail = $('#editor-rail')
  $popovers = $('#editor-popovers')
  $modals = $('#editor-modals')
  $mapkey_textarea; $mapkey_error

  constructor() {
    const param = (new URLSearchParams(window.location.search)).get('mapkey')
    // Normalised on the way in: the presets are written as indented template literals, and the
    // indentation would otherwise ride along in every URL this page hands out.
    this.mapkey = serializeRows(parseRows(param || CONST.GAME_CONFIG.mapkey))
    this.board = new Board(this.mapkey)

    this.accessibility_ui = new AccessibilityUI({
      toggleBoardZoom: out => this.board_ui.toggleZoom(out),
      icons: {
        fullscreen: false, bgm: false, notifcation_sounds: false,
        shorcuts: false, quit: false,
      },
    })

    // Chrome first: the board is fitted to the space the dock and the rail leave it.
    this.render()
    this.accessibility_ui.render()
    this.#renderBoard()
    this.#refresh()
    // Fit to the space the chrome leaves. A saved pan belongs to whatever map was open last,
    // which is rarely this one, so the editor always opens on the whole map. Fitted again once
    // the web fonts land, because the dock is sized by its labels and grows when they swap in.
    this.board_ui.recenter()
    document.fonts?.ready.then(() => {
      this.#measureChrome()
      this.board_ui.recenter()
    })
    window.addEventListener('resize', () => this.#measureChrome())
  }

  /* ----------------------------------------------------------------- chrome */

  render() {
    this.$dock.innerHTML = `
      <div class="dock-row dock-row--brushes">
        <div class="brush-strip" role="group" aria-label="Brush">
          <button class="brush btn btn--quiet active" data-brush="none" aria-pressed="true"
            title="Move the map. Hold Space to pan without putting the brush down.">
            <span class="brush-icon">✥</span>
            <span class="brush-label">Pan</span>
          </button>
          ${TERRAINS.map(type => `
            <button class="brush btn btn--quiet" data-brush="${type}" aria-pressed="false">
              ${tileHtml(type)}
              <span class="brush-label">${type === 'S' ? 'Erase' : CONST.TILES[type]}</span>
            </button>
          `).join('')}
          <button class="brush btn btn--quiet" data-brush="port" aria-pressed="false">
            ${tileHtml('S', '<span class="port-mark"></span>')}
            <span class="brush-label">Port</span>
          </button>
        </div>
      </div>
      <div class="dock-row dock-row--numbers">
        <div class="number-strip" role="group" aria-label="Number to paint">
          <button class="num-chip btn btn--quiet btn--sm active" data-number="${RANDOM}"
            aria-pressed="true">Random</button>
          ${NUMBERS.map(n => `
            <button class="num-chip num-chip--token btn btn--quiet" data-number="${n}"
              aria-pressed="false" aria-label="${n}">${tokenHtml(n, 'dock-token')}</button>
          `).join('')}
        </div>
        <button class="btn btn--quiet btn--sm dock-issues" hidden></button>
      </div>
    `

    this.$float.innerHTML = `
      <button class="btn btn--quiet icon-btn editor-undo" title="Undo" aria-label="Undo">
        <span class="btn-icon" style="--icon: var(--icon-undo)"></span>
      </button>
      <button class="btn btn--quiet icon-btn editor-redo" title="Redo" aria-label="Redo">
        <span class="btn-icon" style="--icon: var(--icon-redo)"></span>
      </button>
    `

    this.$rail.innerHTML = `
      <a class="rail-btn btn btn--quiet editor-back" href="/login" title="Back to the game">
        <span class="rail-icon" aria-hidden="true">←</span>
        <span class="rail-text">Back</span>
      </a>
      ${RAIL.map(item => `
        <button class="rail-btn btn btn--quiet" data-popover="${item.id}"
          aria-expanded="false" aria-controls="popover-${item.id}" title="${item.label}">
          <span class="rail-icon" aria-hidden="true">${item.icon}</span>
          <span class="rail-text">${item.label}</span>
        </button>
      `).join('')}
      <button class="rail-btn btn btn--quiet editor-play" title="Play this map">
        <span class="rail-icon" aria-hidden="true">▶</span>
        <span class="rail-text">Play this map</span>
      </button>
    `

    this.$popovers.innerHTML = `
      ${this.#popover('randomize', 'Randomize', `
        <p class="popover-note">Moves what is already on the map. Nothing is added or taken away.</p>
        <div class="chip-group" role="group" aria-label="What to move">
          ${SHUFFLE_OPTIONS.map(o => chipHtml('shuffle', o.id, o.label, true)).join('')}
        </div>
        <p class="popover-hint">The 6 and the 8 never end up side by side.</p>
        <div class="popover-actions">
          <button class="btn btn--secondary btn--sm editor-shuffle">Shuffle</button>
          <button class="btn btn--quiet btn--sm editor-reset">Start over</button>
        </div>
      `)}
      ${this.#popover('balance', 'Balance', `
        <button class="action-row editor-balance-numbers">
          <b>Even out the numbers</b>
          <span>Deals a fresh set of dice numbers over the land you already have.</span>
        </button>
        <button class="action-row editor-balance-resources">
          <b>Even out the resources</b>
          <span>Keeps the numbers where they are and evens out the five terrains under them.</span>
        </button>
      `)}
      ${this.#popover('info', 'Map info', '<div id="map-report"></div>')}
      ${this.#popover('share', 'Share map', `
        <p class="popover-note">The link carries the whole map. Anyone who opens it gets what is on screen.</p>
        <div class="popover-actions">
          <button class="btn btn--secondary btn--sm editor-copy">Copy link</button>
        </div>
        <div class="popover-split">
          <h3>Map key</h3>
          <p class="popover-hint">The map written out. Paste one you were sent, or copy this to keep.</p>
          <textarea name="mapkey" id="mapkey" rows="6" aria-describedby="mapkey-error"></textarea>
          <p class="mapkey-error" id="mapkey-error" role="alert" hidden></p>
          <div class="popover-actions">
            <button class="btn btn--secondary btn--sm editor-render">Render</button>
          </div>
        </div>
      `)}
      ${this.#popover('port', 'Port', `
        <div class="port-types" role="group" aria-label="Port type">
          ${PORT_OFFERS.map(key => `
            <button class="port-type btn btn--quiet btn--sm" data-type="${key}">
              <span class="trade-type ${key.replace('*', '_')}"></span>
              <span>${CONST.TRADE_OFFERS[key]}</span>
            </button>
          `).join('')}
        </div>
        <p class="popover-hint">Pick the edge the dock faces.</p>
        <div class="port-dial">
          ${tileHtml('S', EDGES.map(dir => `
            <button class="port-edge" data-edge="${dir}" aria-pressed="false"
              title="Face ${dir.replace('_', ' ')}">
              <span class="port-edge-label">${dir.replace('_', ' ')}</span>
            </button>
          `).join(''))}
        </div>
        <div class="popover-actions">
          <button class="btn btn--quiet btn--sm port-clear">Remove port</button>
        </div>
      `)}
    `

    this.$modals.innerHTML = `
      <div class="editor-scrim" hidden>
        <section class="editor-modal panel" id="modal-game" role="dialog" aria-modal="true"
          aria-labelledby="modal-game-title">
          <header class="popover-head">
            <h2 id="modal-game-title">Play this map</h2>
            <button class="btn btn--quiet btn--sm modal-close" aria-label="Close">✕</button>
          </header>
          <div class="popover-body">
            <div class="field">
              <label for="players-select">Players</label>
              <select id="players-select" class="select">
                ${[...Array(7).keys()].map(i => {
                  const v = i + 2
                  return `<option value="${v}" ${v === 3 ? 'selected' : ''}>${v}</option>`
                }).join('')}
              </select>
            </div>
            <p class="seat-note" id="seat-note"></p>
            <div class="field">
              <label for="winpoints-select">Points to win</label>
              <select id="winpoints-select" class="select">
                ${Array.from({ length: 16 }, (_, i) => i + 5).map(v =>
                  `<option value="${v}" ${v === 10 ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </div>
            <div class="field-group">
              <h3>Keep my layout</h3>
              <p class="popover-hint">A new game reshuffles the map before it deals it out. Tick these
                to start on exactly what you built.</p>
              <div class="chip-group">
                ${chipHtml('keep', 'resources', 'Resources', false)}
                ${chipHtml('keep', 'numbers', 'Numbers', false)}
              </div>
            </div>
            <div class="popover-actions popover-actions--end">
              <button class="btn btn--quiet btn--sm modal-close">Cancel</button>
              <button class="btn btn--primary editor-start">Start game</button>
            </div>
          </div>
        </section>
      </div>
    `

    this.$mapkey_textarea = $('#mapkey')
    this.$mapkey_error = $('#mapkey-error')
    this.#setupEvents()
    this.#measureChrome()
    // The dock and the rail change height on their own - a web font swapping in, the problem
    // counter appearing, a strip wrapping - and the board is fitted to what they leave.
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => this.#measureChrome())
      observer.observe(this.$dock)
      observer.observe(this.$rail)
    }
  }

  #popover(id, title, body) {
    return `
      <section class="editor-popover panel" id="popover-${id}" data-popover="${id}" hidden
        role="dialog" aria-modal="false" aria-label="${title}">
        <header class="popover-head">
          <h2>${title}</h2>
          <button class="btn btn--quiet btn--sm popover-close" aria-label="Close ${title}">✕</button>
        </header>
        <div class="popover-body">${body}</div>
      </section>`
  }

  /**
   * The dock's height and the rail's size change with their contents and the viewport, and the
   * board is fitted around them, so they are measured rather than written into a rule.
   */
  #measureChrome() {
    const root = document.documentElement.style
    // Sub-pixel, not `offsetHeight`: the rail is stacked directly on top of the dock, and a
    // rounded height leaves them a fraction of a pixel into each other.
    const dock = this.$dock.getBoundingClientRect()
    const rail = this.$rail.getBoundingClientRect()
    root.setProperty('--dock-h', `${dock.height}px`)
    root.setProperty('--rail-h', `${rail.height}px`)
    root.setProperty('--rail-w', `${rail.width}px`)

    // How far the chrome reaches in from the bottom, for anything that floats clear of it. The
    // rail is a column on the right on a wide screen and a strip above the dock on a phone, so
    // whether it counts against the bottom is read from where it actually is.
    const side_rail = rail.width < window.innerWidth * 0.6
    const bottom = window.innerHeight - Math.min(dock.top, side_rail ? Infinity : rail.top)
    root.setProperty('--chrome-bottom', `${Math.max(0, bottom)}px`)
  }

  /* ----------------------------------------------------------------- events */

  #setupEvents() {
    this.$dock.querySelectorAll('.brush').forEach($b => $b.addEventListener('click', e =>
      this.setBrush(e.currentTarget.dataset.brush)))

    this.$dock.querySelectorAll('.num-chip').forEach($b => $b.addEventListener('click', e =>
      this.setNumber(e.currentTarget.dataset.number)))

    this.$float.querySelector('.editor-undo').addEventListener('click', () => this.undo())
    this.$float.querySelector('.editor-redo').addEventListener('click', () => this.redo())
    this.$dock.querySelector('.dock-issues').addEventListener('click', () => this.togglePopover('info'))

    this.$rail.querySelectorAll('.rail-btn[data-popover]').forEach($b => $b.addEventListener('click', e =>
      this.togglePopover(e.currentTarget.dataset.popover)))
    this.$rail.querySelector('.editor-play').addEventListener('click', () => this.openGameSetup())

    this.$popovers.querySelectorAll('.popover-close').forEach($b => $b.addEventListener('click', () =>
      this.closePopover()))

    // Toggle chips stand in for checkboxes wherever the options are short and of one kind.
    this.$modals.querySelectorAll('.opt-chip').forEach($b => $b.addEventListener('click', e => toggleChip(e.currentTarget)))
    this.$popovers.querySelectorAll('.opt-chip').forEach($b => $b.addEventListener('click', e => toggleChip(e.currentTarget)))

    $('.editor-copy').addEventListener('click', e => this.copyLink(e.currentTarget))
    $('.editor-shuffle').addEventListener('click', () => this.shuffle())
    $('.editor-reset').addEventListener('click', () => {
      this.#commit(serializeRows(parseRows(CONST.GAME_CONFIG.mapkey)))
    })
    $('.editor-balance-numbers').addEventListener('click', () => this.balanceNumbers())
    $('.editor-balance-resources').addEventListener('click', () => this.balanceResources())
    $('.editor-render').addEventListener('click', () => this.renderMapkey())
    $('#players-select').addEventListener('change', () => this.#capPlayerOptions())

    this.$modals.querySelectorAll('.modal-close').forEach($b => $b.addEventListener('click', () => this.closeModal()))
    this.$modals.querySelector('.editor-scrim').addEventListener('click', e => {
      if (e.target === e.currentTarget) { this.closeModal() }
    })
    $('.editor-start').addEventListener('click', () => this.play())

    this.$popovers.querySelectorAll('.port-type').forEach($b => $b.addEventListener('click', e =>
      this.#setPort({ type: e.currentTarget.dataset.type })))
    this.$popovers.querySelectorAll('.port-edge').forEach($b => $b.addEventListener('click', e =>
      this.#setPort({ edge: e.currentTarget.dataset.edge })))
    this.$popovers.querySelector('.port-clear').addEventListener('click', () => {
      if (this.#port) { this.#writePort(this.#port.id, null, null) }
      this.closePopover()
    })

    window.addEventListener('keydown', e => this.#onKeyDown(e))
    window.addEventListener('keyup', e => this.#onKeyUp(e))
    // A window that loses focus never sends the keyup, and a brush stuck aside is worse than a
    // pan that ends early.
    window.addEventListener('blur', () => this.#releaseSpace())
  }

  /** Space belongs to whatever has focus - a button, a field - before it belongs to the board. */
  #focusTakesSpace(e) {
    return !!e.target?.closest?.('button, input, textarea, select, a, [contenteditable]')
  }

  #onKeyDown(e) {
    if (e.key === 'Escape' && this.#modal_open) { return this.closeModal() }
    if (e.key === 'Escape' && this.#open_popover) { return this.closePopover() }

    // Hold Space to pan, the way every canvas tool does: the brush is set aside, not put down,
    // and it is back in hand the moment the key comes up.
    if (e.code === 'Space' && !e.repeat && !this.#focusTakesSpace(e)) {
      e.preventDefault()
      if (this.#space_brush === undefined) {
        this.#space_brush = this.brush
        this.brush = null
        this.#syncTools()
      }
      return
    }

    const mod = e.metaKey || e.ctrlKey
    if (!mod) { return }
    const key = e.key.toLowerCase()
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo() }
    else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); this.redo() }
  }

  #onKeyUp(e) {
    if (e.code === 'Space') { this.#releaseSpace() }
  }

  #releaseSpace() {
    if (this.#space_brush === undefined) { return }
    this.brush = this.#space_brush
    this.#space_brush = undefined
    this.#syncTools()
  }

  /* ------------------------------------------------------------------ tools */

  setBrush(name) {
    const same = name === 'none'
      ? !this.brush
      : this.brush && (this.brush.type === name || (name === 'port' && this.brush.kind === 'port'))
    // Clicking the selected brush puts the board back to panning.
    if (name === 'none' || same) { this.brush = null }
    else if (name === 'port') { this.brush = { kind: 'port' } }
    else { this.brush = { kind: 'terrain', type: name } }
    this.closePopover('port')
    this.#syncTools()
  }

  setNumber(value) {
    const num = value === '' ? null : value === RANDOM ? RANDOM : +value
    // A number on its own is a brush too: it retypes nothing, it just numbers the land it lands on.
    if (this.number === num && this.brush?.kind === 'number') { this.brush = null }
    else if (this.brush?.kind !== 'terrain') { this.brush = { kind: 'number' } }
    this.number = num
    this.#syncTools()
  }

  /** The number to write on one tile: `Random` rolls per tile, so a drag comes out varied. */
  #nextNumber() {
    if (this.number !== RANDOM) { return this.number }
    return NUMBERS[Math.floor(Math.random() * NUMBERS.length)]
  }

  #syncTools() {
    const active = !this.brush ? 'none'
      : this.brush.kind === 'port' ? 'port'
      : this.brush.kind === 'number' ? null
      : this.brush.type
    this.$dock.querySelectorAll('.brush').forEach($b => {
      const on = $b.dataset.brush === active
      $b.classList.toggle('active', on)
      $b.setAttribute('aria-pressed', String(on))
    })
    this.$dock.querySelectorAll('.num-chip').forEach($b => {
      const on = $b.dataset.number === (this.number == null ? '' : String(this.number))
      $b.classList.toggle('active', on)
      $b.setAttribute('aria-pressed', String(on))
    })
    document.body.classList.toggle('painting', !!this.brush && this.brush.kind !== 'port')
    document.body.classList.toggle('port-picking', this.brush?.kind === 'port')
  }

  togglePopover(id) {
    if (this.#open_popover === id) { return this.closePopover() }
    this.closePopover()
    const $pop = this.$popovers.querySelector(`#popover-${id}`)
    if (!$pop) { return }
    $pop.hidden = false
    $pop.classList.add('open')
    this.#open_popover = id
    this.$rail.querySelector(`[data-popover="${id}"]`)?.setAttribute('aria-expanded', 'true')
    $pop.querySelector('button, textarea, select, input')?.focus()
  }

  closePopover(only) {
    if (!this.#open_popover || (only && this.#open_popover !== only)) { return }
    const $pop = this.$popovers.querySelector(`#popover-${this.#open_popover}`)
    $pop?.classList.remove('open')
    if ($pop) {
      $pop.hidden = true
      $pop.style.left = $pop.style.top = $pop.style.right = ''
    }
    this.$rail.querySelector(`[data-popover="${this.#open_popover}"]`)?.setAttribute('aria-expanded', 'false')
    this.#open_popover = null
  }

  copyLink($button) {
    window.navigator.clipboard?.writeText(window.location.href)
    $button.classList.add('copied')
    $button.textContent = 'Link copied'
    setTimeout(() => {
      $button.classList.remove('copied')
      $button.textContent = 'Copy link'
    }, 1500)
  }

  /* ------------------------------------------------------------------ modal */

  /** Game setup takes over the screen: it is the one thing here that is about leaving the editor. */
  openGameSetup() {
    this.closePopover()
    this.#capPlayerOptions()
    const $scrim = this.$modals.querySelector('.editor-scrim')
    $scrim.hidden = false
    this.#modal_open = true
    $('#players-select').focus()
  }

  closeModal() {
    this.$modals.querySelector('.editor-scrim').hidden = true
    this.#modal_open = false
    this.$rail.querySelector('.editor-play')?.focus()
  }

  /* ------------------------------------------------------------------ board */

  /**
   * One board UI for the life of the page. Every pan, zoom and touch listener it installs lives on
   * the container, which outlives a render, so a fresh instance per edit would stack a new set on
   * top of the old ones - and a drag across twenty tiles is twenty edits.
   */
  #renderBoard() {
    if (!this.board_ui) {
      this.board_ui = new MapBuilderBoardUI(this.board, dummyFn)
      // Decision 9: a drag paints when a brush is selected and pans when none is.
      this.board_ui.canPan = () => !this.brush
    }
    this.board_ui.setBoard(this.board)
    this.board_ui.render()
    this.#renderRim()
    this.#bindBoardPointer()
  }

  /**
   * The grow affordances, on all four sides, wired straight to the grid primitives.
   *
   * Placed from the rows' own measured box rather than the board element's: rows carry a `left`
   * offset from the sign chain, so the widest row can reach past the board's width and a rule
   * keyed on the element would put the right-hand button inside the map.
   */
  #renderRim() {
    const $el = this.board_ui.$el
    $el.insertAdjacentHTML('beforeend', Object.keys(GROW).map(side => `
      <button class="rim-add rim-add--${side}" data-side="${side}"
        title="${GROW_LABEL[side]}" aria-label="${GROW_LABEL[side]}">
        <span class="btn-icon" style="--icon: var(--icon-plus)"></span>
      </button>
    `).join(''))

    // Untransformed layout box of the rows, relative to the board: `offsetLeft` and friends
    // ignore the pan and zoom transform, which is exactly the space these are positioned in.
    let min_x = Infinity, max_x = -Infinity, min_y = Infinity, max_y = -Infinity
    $el.querySelectorAll('.row').forEach($row => {
      min_x = Math.min(min_x, $row.offsetLeft)
      max_x = Math.max(max_x, $row.offsetLeft + $row.offsetWidth)
      min_y = Math.min(min_y, $row.offsetTop)
      max_y = Math.max(max_y, $row.offsetTop + $row.offsetHeight)
    })
    const mid_x = (min_x + max_x) / 2, mid_y = (min_y + max_y) / 2
    const at = { top: [mid_x, min_y], bottom: [mid_x, max_y], left: [min_x, mid_y], right: [max_x, mid_y] }

    $el.querySelectorAll('.rim-add').forEach($b => {
      const [x, y] = at[$b.dataset.side]
      if (Number.isFinite(x) && Number.isFinite(y)) { $b.style.left = `${x}px`; $b.style.top = `${y}px` }
      $b.addEventListener('click', e => {
        e.stopPropagation()
        this.grow(e.currentTarget.dataset.side)
      })
    })
  }

  grow(side) { this.#commit(GROW[side](this.mapkey)) }

  #tileAt(e) {
    const $tile = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('#game .board .tile')
    return $tile ? +$tile.dataset.id : null
  }

  /**
   * Painting rides on pointer events over the whole board container rather than per-tile
   * listeners: a committed edit can grow the grid and rebuild every tile element mid-drag, so the
   * tile under the finger is looked up by position each time.
   */
  #bindBoardPointer() {
    if (this.#pointer_bound) { return }
    this.#pointer_bound = true
    const $container = $('#game .board-container')

    $container.addEventListener('pointerdown', e => {
      if (e.button > 0) { return }
      // A second finger means pinch-zoom, never paint: undo whatever the first one drew.
      if (this.#gesture) { return this.#cancelGesture() }
      const id = this.#tileAt(e)
      if (id == null) { return }
      if (this.brush?.kind === 'port' && !e.altKey) { return this.openPort(id) }
      if (!this.brush && !e.altKey) { return }
      e.preventDefault()
      $container.setPointerCapture?.(e.pointerId)
      this.#gesture = { before: this.mapkey, changed: false }
      this.#paint(id, e.altKey)
    })

    $container.addEventListener('pointermove', e => {
      if (!this.#gesture) { return }
      const id = this.#tileAt(e)
      if (id != null) { this.#paint(id, e.altKey) }
    })

    const end = () => this.#endGesture()
    $container.addEventListener('pointerup', end)
    $container.addEventListener('pointercancel', end)
    window.addEventListener('pointerup', end)
  }

  /* ---------------------------------------------------------------- editing */

  /** `[row, index]` of a tile in the parsed board, or `[-1, -1]`. */
  #position(tile) {
    for (let i = 0; i < this.board.tile_rows.length; i++) {
      const idx = this.board.tile_rows[i].indexOf(tile)
      if (idx !== -1) { return [i, idx] }
    }
    return [-1, -1]
  }

  #paint(id, alt) {
    const tile = this.board.findTile(id)
    if (!tile) { return }
    // Alt-click is a desktop shortcut for the eraser brush, never the only way to erase.
    const kind = alt ? 'terrain' : this.brush.kind
    const type = alt ? 'S' : this.brush.type

    if (kind === 'number') {
      if (tile.type === 'S' || tile.type === 'D') { return }
      if (this.#numbered(tile)) { return }
      return this.#write(tile, tile.type, this.#nextNumber())
    }

    const wants_number = type !== 'S' && type !== 'D'
    const unchanged = tile.type === type
      && (!wants_number || this.#numbered(tile))
      && !(type === 'S' && tile.trade_edge)
    if (unchanged) { return }
    this.#write(tile, type, wants_number ? this.#nextNumber() : null)
  }

  /**
   * Whether the tile already carries what the brush would write. A `Random` brush only asks that
   * there is *a* number there, because a drag revisits the same tile on every pointer move and
   * re-rolling on each one would make a gesture impossible to aim.
   */
  #numbered(tile) {
    if (this.number === RANDOM) { return !!tile.num }
    return String(tile.num || '') === String(this.number == null ? '' : this.number)
  }

  #write(tile, type, num) {
    const [r, c] = this.#position(tile)
    if (r === -1) { return }
    const rows = parseRows(this.mapkey)
    rows[r].tokens[c] = type === 'S' ? 'S' : type === 'D' ? 'D' : type + (num || '')
    let mapkey = serializeRows(rows)
    // Land has to be ringed by sea; the grid grows where it is not, in any direction.
    if (type !== 'S') { mapkey = expandSeaBordersAt(mapkey, r, c) }

    if (this.#gesture) {
      this.#gesture.changed = true
      this.#apply(mapkey)
    } else {
      this.#commit(mapkey)
    }
  }

  #writePort(id, type, edge) {
    const tile = this.board.findTile(id)
    const [r, c] = this.#position(tile)
    if (r === -1) { return }
    const rows = parseRows(this.mapkey)
    rows[r].tokens[c] = (type && edge)
      ? `S(${CONST.DIR_HELPER.MAPKEYS[edge]}_${type.replace(/\d+/, '')}${type.replace(/[^\d]+/, '')})`
      : 'S'
    this.#commit(serializeRows(rows))
  }

  openPort(id) {
    const tile = this.board.findTile(id)
    if (!tile || tile.type !== 'S') { return }
    this.#port = {
      id,
      type: tile.trade_type ? `${tile.trade_type}${tile.trade_ratio}` : null,
      edge: tile.trade_edge || null,
    }
    this.togglePopover('port')
    this.#syncPort()
    this.#anchorPopover(id)
    this.#keepTileVisible(id)
  }

  #setPort(patch) {
    if (!this.#port) { return }
    Object.assign(this.#port, patch)
    this.#syncPort()
    const { id, type, edge } = this.#port
    if (type && edge) { this.#writePort(id, type, edge) }
  }

  #syncPort() {
    const { type, edge } = this.#port || {}
    this.$popovers.querySelectorAll('.port-type').forEach($b =>
      $b.classList.toggle('active', $b.dataset.type === type))
    this.$popovers.querySelectorAll('.port-edge').forEach($b => {
      const on = $b.dataset.edge === edge
      $b.classList.toggle('active', on)
      $b.setAttribute('aria-pressed', String(on))
    })
    const $tile = this.$popovers.querySelector('.port-dial .editor-tile')
    $tile.dataset.trade = type ? type.replace(/\d+/, '') : ''
    $tile.dataset.tradeDir = edge || ''
  }

  /**
   * Put the port surface beside the tile it is about, so the choice is made on the map rather than
   * in a panel that could be about anything. On a phone it stays the bottom sheet every other
   * popover is - there is no room to sit beside anything.
   */
  #anchorPopover(id) {
    const $pop = this.$popovers.querySelector('.editor-popover.open')
    const $tile = this.board_ui.$el.querySelector(`.tile[data-id="${id}"]`)
    if (!$pop || !$tile) { return }
    if (window.innerWidth < 768) { return }
    const tile = $tile.getBoundingClientRect()
    const rail = this.$rail.offsetWidth
    const dock = this.$dock.offsetHeight
    const { offsetWidth: w, offsetHeight: h } = $pop
    let left = tile.right + 16
    if (left + w > window.innerWidth - rail - 8) { left = tile.left - w - 16 }
    $pop.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rail - w - 8))}px`
    $pop.style.top = `${Math.max(8, Math.min(tile.top + tile.height / 2 - h / 2, window.innerHeight - dock - h - 8))}px`
    $pop.style.right = 'auto'
  }

  /** Pan the board just enough that an open popover is not sitting on the tile it is about. */
  #keepTileVisible(id) {
    const $tile = this.board_ui.$el.querySelector(`.tile[data-id="${id}"]`)
    const $pop = this.$popovers.querySelector('.editor-popover.open')
    if (!$tile || !$pop) { return }
    const tile = $tile.getBoundingClientRect()
    const pop = $pop.getBoundingClientRect()
    const overlaps = tile.right > pop.left && tile.left < pop.right
      && tile.bottom > pop.top && tile.top < pop.bottom
    if (!overlaps) { return }
    // Push it out the nearer way, horizontally on a wide screen and vertically on a phone.
    if (pop.width < window.innerWidth * 0.8) { this.board_ui.panBy(pop.left - tile.right - 16, 0) }
    else { this.board_ui.panBy(0, pop.top - tile.bottom - 16) }
  }

  /* ---------------------------------------------------------------- history */

  #commit(mapkey) {
    if (mapkey === this.mapkey) { return }
    this.#push(this.mapkey)
    this.#apply(mapkey)
    this.#refresh()
  }

  #push(mapkey) {
    this.#undo.push(mapkey)
    if (this.#undo.length > HISTORY_DEPTH) { this.#undo.shift() }
    this.#redo = []
  }

  #endGesture() {
    const gesture = this.#gesture
    this.#gesture = null
    if (!gesture || !gesture.changed) { return }
    this.#push(gesture.before)
    this.#refresh()
  }

  #cancelGesture() {
    const gesture = this.#gesture
    this.#gesture = null
    if (gesture?.changed) { this.#apply(gesture.before) }
    this.#refresh()
  }

  undo() {
    if (!this.#undo.length) { return }
    this.#redo.push(this.mapkey)
    this.#apply(this.#undo.pop())
    this.#refresh()
  }

  redo() {
    if (!this.#redo.length) { return }
    this.#undo.push(this.mapkey)
    this.#apply(this.#redo.pop())
    this.#refresh()
  }

  /** Put a mapkey on screen. No history entry, in-page or in the browser. */
  #apply(mapkey) {
    this.mapkey = mapkey
    this.board = new Board(mapkey)
    this.#renderBoard()
    this.#syncURL()
    this.#flagTiles()
  }

  /**
   * The address bar keeps a link that reproduces the board, and nothing more: `replaceState`, so
   * editing adds no history entry and Back leaves the editor instead of reverting one tile.
   */
  #syncURL() {
    const url = new URL(window.location.href)
    url.searchParams.set('mapkey', this.mapkey)
    window.history.replaceState({}, '', url.href)
  }

  /* --------------------------------------------------------------- feedback */

  #refresh() {
    this.$mapkey_textarea.value = this.mapkey
    this.$float.querySelector('.editor-undo').disabled = !this.#undo.length
    this.$float.querySelector('.editor-redo').disabled = !this.#redo.length
    this.#syncTools()
    this.#capPlayerOptions()
    this.updateInfoSection()
    this.#flagTiles()
    this.#measureChrome()
  }

  /** Grey out player counts this map cannot seat, so "Play this Map" can only start a real game. */
  #capPlayerOptions() {
    const $select = $('#players-select')
    const seats = Board.maxPlayers(this.mapkey)
    $select.querySelectorAll('option').forEach($option => {
      $option.disabled = +$option.value > seats
      $option.textContent = $option.disabled ? `${$option.value} (map too small)` : $option.value
    })
    if (+$select.value > seats) { $select.value = String(Math.max(2, seats)) }
    // Stated outside the selector too: a greyed-out option says nothing about why.
    const $note = $('#seat-note')
    $note.textContent = seats < 2
      ? 'This map cannot seat a game yet - it needs more land.'
      : `This map seats ${seats} player${seats === 1 ? '' : 's'}.`
    $note.classList.toggle('warn', seats < +$select.value)
  }

  /**
   * What is wrong with the map, per tile. Land without a number never pays out, and two red
   * numbers on neighbouring tiles make one corner worth far more than any other.
   */
  #problems() {
    const tiles = this.board.tile_rows.flat()
    const flags = new Map()
    const flag = (tile, text) => flags.set(tile.id, text)

    tiles.forEach(tile => {
      if (tile.type !== 'S' && tile.type !== 'D' && !tile.num) { flag(tile, 'No number') }
    })
    const red = tile => tile && CONST.RED_NUMBERS.includes(+tile.num)
    tiles.filter(red).forEach(tile => EDGES.forEach(dir => {
      const neighbor = tile.adjacent_tiles[dir]
      if (red(neighbor)) { flag(tile, 'Next to another 6 or 8'); flag(neighbor, 'Next to another 6 or 8') }
    }))
    return flags
  }

  #flagTiles() {
    const flags = this.#problems()
    this.board_ui.$el.querySelectorAll('.tile').forEach($tile => {
      const text = flags.get(+$tile.dataset.id)
      $tile.classList.toggle('flagged', !!text)
      $tile.querySelector('.tile-flag')?.setAttribute('title', text || '')
    })
    const $issues = this.$dock.querySelector('.dock-issues')
    $issues.hidden = !flags.size
    $issues.textContent = `⚠ ${flags.size} tile${flags.size === 1 ? '' : 's'} to fix`
  }

  /**
   * The map read back as a sheet: what it seats, what it grows, and the shape of the dice numbers
   * on it. The dice strip is the point of the panel - a map is fair when those bars come out as a
   * bell, and a row of real number tokens says that faster than a list of counts ever did.
   */
  updateInfoSection() {
    const tiles = this.board.tile_rows.flat()
    const counts = {}
    const numbers = {}
    let land = 0
    tiles.forEach(tile => {
      if (tile.type === 'S') { return }
      land++
      counts[tile.type] = (counts[tile.type] || 0) + 1
      if (tile.num) { numbers[tile.num] = (numbers[tile.num] || 0) + 1 }
    })
    const seats = Board.maxPlayers(this.mapkey)
    const most = Math.max(1, ...Object.values(counts))
    const tallest = Math.max(1, ...Object.values(numbers))
    const order = [...TERRAINS.filter(t => t !== 'S' && t !== 'D'), 'D'].filter(t => counts[t])
    const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`

    const flags = this.#problems()
    const grouped = {}
    flags.forEach(text => { grouped[text] = (grouped[text] || 0) + 1 })

    $('#map-report').innerHTML = `
      <dl class="info-facts">
        <dt>Seats</dt><dd>${seats < 2 ? 'nobody yet' : plural(seats, 'player')}</dd>
        <dt>Land</dt><dd>${plural(land, 'tile')}</dd>
      </dl>

      ${flags.size ? `
        <div class="info-problems">
          <h3>${plural(flags.size, 'tile')} to fix</h3>
          <ul>
            ${Object.entries(grouped).map(([text, count]) =>
              `<li>${text} &mdash; ${plural(count, 'tile')}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${land ? `
        <section class="info-block">
          <h3>Terrain</h3>
          <ul class="res-list">
            ${order.map(type => `
              <li class="res-row" style="--fill: ${counts[type] / most * 100}%; --hue: ${TERRAIN_HUE[type]}">
                <span class="res-name"><span class="res-icon" aria-hidden="true">${CONST.TILE_EMOJIS[type]}</span><span>${type === 'D' ? 'Desert' : CONST.RESOURCES[CONST.TILE_RES[type]]}</span></span>
                <span class="res-bar"></span>
                <span class="res-count">${counts[type]}</span>
              </li>
            `).join('')}
          </ul>
        </section>

        <section class="info-block">
          <h3>Dice numbers</h3>
          <div class="dice-strip">
            ${NUMBERS.map(n => {
              const count = numbers[n] || 0
              return `
              <div class="dice-col${count ? '' : ' empty'}" role="img"
                aria-label="${n}: ${plural(count, 'tile')}">
                <span class="dice-count">${count || ''}</span>
                <span class="dice-bar" style="--fill: ${count / tallest * 100}%"></span>
                ${tokenHtml(n, 'dice-token')}
              </div>`
            }).join('')}
          </div>
          <p class="popover-hint">How many tiles carry each number. A map plays evenly when the
            bars in the middle are the tallest.</p>
        </section>
      ` : '<p class="popover-note">Nothing on the map yet. Pick a terrain below and paint some land.</p>'}
    `
  }

  /* --------------------------------------------------------------- map tools */

  renderMapkey() {
    const mapkey = this.$mapkey_textarea.value
    // Checked before it is committed, so a bad key leaves the board that is on screen alone. The
    // message goes beside the field: no blocking dialog, nothing to dismiss before fixing it.
    let problem = validateMapkey(mapkey)
    if (!problem) {
      try { new Board(mapkey) }
      catch (e) { problem = e.message }
    }
    this.$mapkey_error.hidden = !problem
    this.$mapkey_error.textContent = problem ? `That map key could not be read: ${problem}.` : ''
    if (!problem) { this.#commit(mapkey) }
  }

  shuffle() {
    const $popover = this.$popovers.querySelector('#popover-randomize')
    const options = SHUFFLE_OPTIONS.filter(o => chipOn($popover, 'shuffle', o.id)).map(o => o.id)
    if (!options.length) { return }
    this.#applyShuffle(options.join('-'), this.mapkey)
  }

  /** Re-read a mapkey, shuffle it and commit the result. */
  #applyShuffle(kind, mapkey) {
    const shuffled = (new BoardShuffler(mapkey)).shuffle(kind)
    this.#commit(shuffled.replace(/([+-])/g, '\n$1'))
  }

  /** All land tiles that carry a resource (not sea, not desert) */
  #resourceTiles() {
    return this.board.tile_rows.flat().filter(tile => tile.type !== 'S' && tile.type !== 'D')
  }

  balanceNumbers() {
    const tiles = this.#resourceTiles()
    if (!tiles.length) { return }
    const total = tiles.length
    // 20% red, 40% at the edges of the bell, the rest in between.
    const high = Math.round(total * 0.2)
    const low = Math.round(total * 0.4)
    const mid = total - high - low
    const pool = [
      ...Array.from({ length: high }, (_, i) => i % 2 === 0 ? 6 : 8),
      ...Array.from({ length: low }, (_, i) => [2, 3, 11, 12][i % 4]),
      ...Array.from({ length: mid }, (_, i) => [4, 5, 9, 10][i % 4]),
    ]
    const shuffled = this.#shuffleArray(pool)
    tiles.forEach((tile, i) => { tile.num = shuffled[i] })
    // BoardShuffler spaces them out; 6 and 8 never end up adjacent.
    this.#applyShuffle('number', this.board.generateMapKey())
  }

  balanceResources() {
    const tiles = this.#resourceTiles()
    if (!tiles.length) { return }
    const total = tiles.length
    const each = Math.floor(total / 5)
    const remainder = total % 5
    // Lumber, brick and wheat run out first, so they take the remainder.
    const priority = ['J', 'C', 'F', 'G', 'M']
    const pool = priority.flatMap((type, i) =>
      Array(each + (i < remainder ? 1 : 0)).fill(type))
    const shuffled = this.#shuffleArray(pool)
    tiles.forEach((tile, i) => { if (shuffled[i]) { tile.type = shuffled[i] } })
    this.#applyShuffle('tile', this.board.generateMapKey())
  }

  #shuffleArray(array) {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  play() {
    const host = (localStorage.getItem(CONST.STORAGE_KEYS.PLAYER_NAME) || 'Editor Host').trim() || 'Editor Host'
    const players = +($('#players-select').value || 3)
    const config = {
      mapkey: this.mapkey,
      win_points: +($('#winpoints-select').value || CONST.GAME_CONFIG.win_points),
      map_shuffle: 'none',
      do_not_shuffle_resources: chipOn(this.$modals, 'keep', 'resources'),
      do_not_shuffle_numbers: chipOn(this.$modals, 'keep', 'numbers'),
    }
    const href = `/game/new?name=${encodeURIComponent(host)}&players=${encodeURIComponent(players)}`
      + `&config=${encodeURIComponent(JSON.stringify(config))}`
    window.open(href, '_blank')
    this.closeModal()
  }
}

window.map_editor = new MapEditor()
