import Board from "../board/board.js"
import * as CONST from "../const.js"
const $ = document.querySelector.bind(document)
const oKeys = Object.keys

export default class BoardUI {
  #board; #onClick; #getColorId;
  #size = { MIN: 0.1, MAX: 5 }
  #boardWidth = 0
  #boardHeight = 0
  #renderedCorners = []
  #renderedEdges = []
  #scale = 1
  #pan = { x: 0, y: 0 }
  #isDragging = false
  #lastMousePos = { x: 0, y: 0 }
  #eventsSetup = false
  $el = $('#game .board')

  /** @param {Board} board  */
  constructor(board, onClick, size, getColorId) {
    this.#board = board
    this.#onClick = onClick
    this.#size = size || this.#size
    this.#getColorId = (typeof getColorId === 'function') ? getColorId : (pid => pid)

    try {
      const savedScale = parseFloat(localStorage.getItem('board-scale'))
      if (!isNaN(savedScale) && isFinite(savedScale)) {
        this.#scale = savedScale
      }
      const savedPan = JSON.parse(localStorage.getItem('board-pan'))
      if (savedPan && !isNaN(savedPan.x) && !isNaN(savedPan.y) && isFinite(savedPan.x) && isFinite(savedPan.y)) {
        this.#pan = savedPan
      }
    } catch (e) {
      console.error('BoardUI: Error loading from localStorage', e)
    }
  }

  toggleBlur(bool) { this.$el.classList[bool ? 'add' : 'remove']('blur') }

  render() {
    this.#renderedCorners = []
    this.#renderedEdges = []
    /** @todo fix the variable names base on convention */
    let startDiff = 0
    let maxLeft = 0
    let maxLength = 0

    this.$el.innerHTML = this.#board.tile_rows.map((row, i) => {
      startDiff += (row.diff || 0)
      if (startDiff < maxLeft) { maxLeft = startDiff }
      if (row.length > maxLength) { maxLength = row.length }

      return `
        <div class="row row-${i + 1}"
          style="left:calc(${startDiff} * var(--tile-width)/2 + ${startDiff * -1}px);
            width: calc(var(--tile-width) * ${row.length})"
        >
          ${this.renderRow(row)}
        </div>
      `
    }).join('')

    this.$el.style.paddingLeft = `calc(var(--tile-width) / 2 * ${maxLeft * -1})`
    this.$el.style.width = `calc(var(--tile-width) * ${maxLength})`

    this.#boardWidth = Math.max(100, (maxLength + maxLeft / 2) * 160) // Approximate tile width
    this.#boardHeight = Math.max(100, this.#board.tile_rows.length * 130) // Approximate row height

    const savedPanStr = localStorage.getItem('board-pan')
    let hasValidSavedPan = false
    if (savedPanStr) {
      try {
        const savedPan = JSON.parse(savedPanStr)
        hasValidSavedPan = savedPan && !isNaN(savedPan.x) && !isNaN(savedPan.y) && isFinite(savedPan.x) && isFinite(savedPan.y)
      } catch (e) {}
    }

    if (!hasValidSavedPan) {
      this.#pan.x = (window.innerWidth - this.#boardWidth * this.#scale) / 2
      this.#pan.y = (window.innerHeight - this.#boardHeight * this.#scale) / 2
    }

    this.#updateZoomLimits()
    this.#updateTransform()
    this.#setupEvents()
  }

  #updateZoomLimits() {
    const fitScale = Math.min(window.innerWidth / this.#boardWidth, window.innerHeight / this.#boardHeight)
    // Zoom out limit: half of what's needed to fit the screen,
    // but not more restrictive than 0.5 and not less than 0.1
    this.#size.MIN = Math.max(0.1, Math.min(0.5, fitScale * 0.5))
  }

  renderRow(row) {
    return row.map((tile, j) =>
      `<div
        class="tile ${tile.type} ${tile.robbed ? 'robbed' : ''}"
        data-id="${tile.id}"
        ${(tile.type === 'S' && tile.trade_edge)
        ? `data-trade="${tile.trade_type}" data-trade-dir="${tile.trade_edge}"`
        : ''
      }
      >
        <div class="background"></div>
        <div class="corners">${this.renderCorners(tile)}</div>
        <div class="edges">${this.renderEdges(tile)}</div>
        ${tile.type === 'S' ? `<div class="beaches">${this.renderBeaches(tile)}</div>` : ''}
        ${tile.num
        ? `<div
              class="number ${tile.num > 5 && tile.num < 9 ? 'red' : ''}"
              num="${tile.num}"
              dots="${'.'.repeat(6 - Math.abs(7 - tile.num))}">
            </div>`
        : ''
        }
      </div>`
    ).join('')
  }

  renderCorners(tile) {
    return oKeys(tile.corners).map(dir => {
      const corner = tile.corners[dir]
      // if (corner.id == 4) {debugger}
      let $_trade = ''
      if (tile.type === 'S' && tile.trade_edge && corner.trade
        && CONST.DIR_HELPER.EDGE_TO_CORNERS[tile.trade_edge].includes(dir)) {
        $_trade = `<div class="trade-post p-${dir}"></div>`
      }
      if (this.#renderedCorners.includes(corner.id)) { return $_trade }
      this.#renderedCorners.push(corner.id)
      return `<div class="corner" data-id="${corner.id}" data-dir="${dir}"></div>
        ${$_trade}
      `
    }).join('')
  }

  renderEdges(tile) {
    return oKeys(tile.corners).map(dir => {
      const corner = tile.corners[dir]
      const relevant_edges = {
        top: ['left', 'right'],
        top_left: ['bottom'],
        top_right: ['bottom'],
        // bottom_left: ['top', 'right'],
        // bottom_right: ['top', 'left'],
        bottom: ['left', 'right'],
      }[dir]
      return relevant_edges?.map(e_dir => {
        const edge = corner.edges[e_dir]
        if (!edge || this.#renderedEdges.includes(edge.id)) { return '' }
        this.#renderedEdges.push(edge.id)
        let css_dir = dir + '-' + e_dir
        if (e_dir === 'bottom') {
          css_dir = {
            'top_left': 'left',
            'top_right': 'right',
          }[dir]
        }
        return `<div class="edge" data-id="${edge.id}" data-dir="${css_dir}"></div>`
      }).join('')
    }).join('')
  }

  renderBeaches(tile) {
    return oKeys(tile.adjacent_tiles).map(dir => {
      const neighbor = tile.adjacent_tiles[dir]
      const variant = Math.floor(Math.random() * 3) + 1
      // Sea tiles: show beach where adjacent tile is land
      if (tile.type === 'S') {
        return (neighbor && neighbor.type !== 'S')
          ? `<div class="beach beach-${variant} beach-${dir}"></div>`
          : ''
      }
      // Land tiles: show beach on map border (no neighbor)
      return (!neighbor)
        ? `<div class="beach beach-${variant} beach-${dir}"></div>`
        : ''
    }).join('')
  }

  #setupEvents() {
    this.$el.querySelectorAll('.corner').forEach($corner => {
      $corner.addEventListener('click', e => {
        if (!e.target.classList.contains('shown')) return
        this.#onClick(CONST.LOCS.CORNER, +e.target.dataset.id)
      })
    })
    this.$el.querySelectorAll('.edge').forEach($edge => {
      $edge.addEventListener('click', e => {
        if (!e.target.classList.contains('shown')) return
        this.#onClick(CONST.LOCS.EDGE, +e.target.dataset.id)
      })
    })
    this.$el.querySelectorAll('.background, .number').forEach($tile => {
      $tile.addEventListener('click', e => {
        if (!e.target.parentElement.classList.contains('shown')) return
        this.#onClick(CONST.LOCS.TILE, +e.target.parentElement.dataset.id)
      })
    })

    if (this.#eventsSetup) return
    this.#eventsSetup = true

    window.addEventListener('resize', () => {
      this.#updateZoomLimits()
      this.#updateTransform()
    })

    const $container = this.$el.parentElement
    $container.addEventListener('wheel', e => {
      e.preventDefault()
      const delta = -e.deltaY
      const zoomFactor = Math.pow(1.1, delta / 100)
      this.#zoom(zoomFactor, e.clientX, e.clientY)
    }, { passive: false })

    $container.addEventListener('mousedown', e => {
      if (e.button !== 0) return
      this.#isDragging = true
      this.#lastMousePos = { x: e.clientX, y: e.clientY }
    })

    window.addEventListener('mousemove', e => {
      if (!this.#isDragging) return
      const dx = e.clientX - this.#lastMousePos.x
      const dy = e.clientY - this.#lastMousePos.y
      this.#pan.x += dx
      this.#pan.y += dy
      this.#lastMousePos = { x: e.clientX, y: e.clientY }
      this.#updateTransform()
    })

    window.addEventListener('mouseup', () => {
      this.#isDragging = false
    })

    // Touch events
    let lastTouchDistance = 0
    let lastTouchPos = null

    $container.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        lastTouchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      } else if (e.touches.length === 2) {
        lastTouchDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        )
        lastTouchPos = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        }
      }
    }, { passive: false })

    $container.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && lastTouchPos) {
        e.preventDefault()
        const dx = e.touches[0].clientX - lastTouchPos.x
        const dy = e.touches[0].clientY - lastTouchPos.y
        this.#pan.x += dx
        this.#pan.y += dy
        lastTouchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        this.#updateTransform()
      } else if (e.touches.length === 2 && lastTouchPos) {
        e.preventDefault()
        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        )
        const factor = lastTouchDistance ? (distance / lastTouchDistance) : 1
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        this.#pan.x += midX - lastTouchPos.x
        this.#pan.y += midY - lastTouchPos.y
        this.#zoom(factor, midX, midY)
        lastTouchDistance = distance
        lastTouchPos = { x: midX, y: midY }
      }
    }, { passive: false })

    const resetTouch = e => {
      if (e.touches.length === 1) {
        lastTouchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      } else if (e.touches.length === 2) {
        lastTouchDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        )
        lastTouchPos = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        }
      } else {
        lastTouchPos = null
      }
    }
    $container.addEventListener('touchend', resetTouch)
    $container.addEventListener('touchcancel', resetTouch)
  }

  #zoom(factor, mouseX, mouseY) {
    const newScale = Math.min(Math.max(this.#scale * factor, this.#size.MIN), this.#size.MAX)
    const actualFactor = newScale / this.#scale
    this.#pan.x = mouseX - (mouseX - this.#pan.x) * actualFactor
    this.#pan.y = mouseY - (mouseY - this.#pan.y) * actualFactor
    this.#scale = newScale
    this.#updateTransform()
  }

  #clampPan() {
    const margin = 100 // Minimum pixels of board to keep visible
    const scaledWidth = this.#boardWidth * this.#scale
    const scaledHeight = this.#boardHeight * this.#scale

    // Calculate limits based on viewport size and scaled board size
    const minX = margin - scaledWidth
    const maxX = window.innerWidth - margin
    const minY = margin - scaledHeight
    const maxY = window.innerHeight - margin

    this.#pan.x = Math.min(Math.max(this.#pan.x, minX), maxX)
    this.#pan.y = Math.min(Math.max(this.#pan.y, minY), maxY)
  }

  #updateTransform() {
    this.#scale = Math.min(Math.max(this.#scale, this.#size.MIN), this.#size.MAX)
    if (isNaN(this.#scale) || !isFinite(this.#scale)) { this.#scale = 1 }
    this.#clampPan()
    this.$el.style.transform = `translate(${this.#pan.x}px, ${this.#pan.y}px) scale(${this.#scale})`
    try {
      localStorage.setItem('board-scale', this.#scale)
      localStorage.setItem('board-pan', JSON.stringify(this.#pan))
    } catch (e) {}
  }

  recenter() {
    this.#scale = 1
    this.#pan.x = (window.innerWidth - this.#boardWidth * this.#scale) / 2
    this.#pan.y = (window.innerHeight - this.#boardHeight * this.#scale) / 2
    this.#updateTransform()
  }

  build(pid, piece, location) {
    if (piece === 'S' || piece === 'C') {
      const $corner = this.#$getCorner(location)
      if (!$corner) return
      $corner.classList.remove('shown')
      const cid = this.#getColorId(pid)
      piece === 'S' && $corner.classList.add('taken', `p${pid}`, `pc${cid}`)
      setTimeout(_ => { $corner.dataset.taken = piece }, 200) // For animation
    } else if (piece === 'R') {
      const $edge = this.#$getEdge(location)
      $edge?.classList.remove('shown')
      $edge?.classList.add('taken')
      const cid = this.#getColorId(pid)
      setTimeout(_ => { $edge?.classList.add('p' + pid); $edge?.classList.add('pc' + cid) }, 100) // For animation
    }
  }

  moveRobber(id) {
    this.$el.querySelector('.tile.robbed')?.classList.remove('robbed')
    this.$el.querySelector('.tile.robber-animate')?.classList.remove('robber-animate')
    this.#$getTile(id)?.classList.add('robbed', 'robber-animate')
    setTimeout(_ => this.$el.querySelector('.tile.robber-animate')?.classList.remove('robber-animate'), 200)
  }

  toggleZoom(out) {
    const factor = out ? 0.9 : 1.1
    this.#zoom(factor, window.innerWidth / 2, window.innerHeight / 2)
  }

  #$getCorner(id) { return this.$el.querySelector(`.corner[data-id="${id}"]`) }
  #$getEdge(id) { return this.$el.querySelector(`.edge[data-id="${id}"]`) }
  #$getTile(id) { return this.$el.querySelector(`.tile[data-id="${id}"]`) }
  
  setCornerSelected(id, selected) { this.#$getCorner(id)?.classList[selected ? 'add' : 'remove']('selected') }
  showCorners(ids = []) { ids.forEach(id => this.#$getCorner(id)?.classList.add('shown')) }
  showEdges(ids = []) { ids.forEach(id => this.#$getEdge(id)?.classList.add('shown')) }
  showTiles(ids = []) { ids.forEach(id => this.#$getTile(id)?.classList.add('shown')) }

  showLongestEdges(ids = []) { ids.forEach(id => this.#$getEdge(id)?.classList.add('longest')) }

  animateRobber() {
    this.$el.querySelector('.tile.robbed')?.classList.add('robber-animate')
  }

  hideAllShown() {
    this.$el.querySelectorAll('.corner.shown, .edge.shown, .tile.shown').forEach($el => {
      $el.classList.remove('shown')
    })
    this.$el.querySelectorAll('.corner.selected').forEach($el => $el.classList.remove('selected'))
    this.hideLongestRoads()
  }
  hideLongestRoads() {
    this.$el.querySelectorAll('.edge.longest').forEach($el => $el.classList.remove('longest'))
  }

  updatePlayerColor(pid, cid) {
    const pcs = Array.from({ length: 11 }, (_, i) => 'pc' + i)
    // Update corners and edges belonging to this pid
    this.$el.querySelectorAll(`.corner.taken.p${pid}, .edge.taken.p${pid}`).forEach($el => {
      pcs.forEach(c => $el.classList.remove(c))
      $el.classList.add('pc' + cid)
    })
  }
}
