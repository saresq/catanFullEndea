import * as CONST from "./const.js"
import Board from "./board/board.js"
import BoardShuffler from "./board/board_shuffler.js"
import MapBuilderBoardUI from "./ui/map_builder_board_ui.js"
import AccessibilityUI from "./ui/accessibility_ui.js"
const $ = document.querySelector.bind(document)

const dummyFn = _ => _
const PROD_URL = 'https://catan-full-endea.onrender.com/'

class Shuffler {
  board; board_ui; accessibility_ui
  /**
   * @type { {
   *  id: number
   *  type: string
   *  number: number
   *  trade_type: string
   *  trade_dir: string
   * } }
   */
  tile_selection_obj
  $mapkey_textarea; $shuffle_tiles; $shuffle_numbers; $shuffle_ports; $tile_selector
  $el = $('#shuffler')
  $tile_selection_container = $('#tile-selection-container')

  constructor() {
    const mapkey = (new URLSearchParams(window.location.search)).get('mapkey')
    this.board = new Board(mapkey || CONST.GAME_CONFIG.mapkey)
    this.board_ui = new MapBuilderBoardUI(this.board, dummyFn)

    this.accessibility_ui = new AccessibilityUI({
      toggleBoardZoom: out => this.board_ui.toggleZoom(out),
      icons: {
        fullscreen: false, bgm: false, notifcation_sounds: false,
        shorcuts: false, quit: false,
      },
    })

    this.board_ui.render()
    this.accessibility_ui.render()
    this.render()
  }

  render() {
    this.$el.innerHTML = `
      <div class="shuffler-section">
        <div class="title">Shuffle Options:</div>
        <label>
          <input type="checkbox" name="shuffle" id="shuffle-tiles" checked>
          <span>Shuffle Locations</span>
        </label>
        <label>
          <input type="checkbox" name="shuffle" id="shuffle-numbers" checked>
          <span>Shuffle Numbers</span>
          <div><small>(Will keep the 6 & 8 apart)</small></div>
        </label>
        <label>
          <input type="checkbox" name="shuffle" id="shuffle-ports" checked>
          <span>Shuffle Ports</span>
        </label>
        <div class="button shuffle">Shuffle</div>
        <div class="button text reset">Reset Map</div>
        <div class="button text copy"></div>
      </div>
      <hr/>
      <label class="edit-section">
        <input type="checkbox" name="edit-map" id="toggle-edit-input"/>
        <div class="button open-edit-text">Edit Map</div>
        <div class="button text close-edit-text">Close Editor</div>
      </label>
      <hr/>
      <div class="mapkey-section">
        <div class="title">Map Key:</div>
        <textarea name="mapkey" id="mapkey">${this.board.mapkey}</textarea>
        <div class="button render secondary">Render</div>
      </div>
      <hr/>
      <div class="play-section">
        <div class="title">Play:</div>
        <div class="form-row">
          <label for="players-select">Players:</label>
          <select id="players-select" class="select players-select">
            ${[...Array(7).keys()].map(i => {
              const v = i + 2
              const sel = v === 3 ? 'selected' : ''
              return `<option value="${v}" ${sel}>${v}</option>`
            }).join('')}
          </select>
        </div>
        <div class="form-row">
          <label for="winpoints-select">Victory points:</label>
          <select id="winpoints-select" class="select winpoints-select">
            ${Array.from({ length: 16 }, (_, i) => i + 5).map(v => `<option value="${v}" ${v === 10 ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="button play">Play this Map</div>
      </div>
    `

    this.$tile_selection_container.innerHTML = `
      <div id="tile-selector"
        data-mode="start"
        data-tile="J"
        data-trade-type="*"
        ${Object.values(CONST.DIR_HELPER.KEYS).map(dir =>
          `data-land_${dir}="true"`
        ).join('')}
      >
        <!-- modes = start|tiles|number|trade|trade-direction -->
        <div class="title">
          <div>Click on the tiles to edit.</div>
          <span class="button text">Clean Start</span>
        </div>
        <div class="select-tiles">
          ${Object.entries(CONST.TILES).map(([t_key, t_name]) => `
            <div class="tile-container ${t_key}" data-type="${t_key}">
              <div class="tile ${t_key}">
                ${t_key === 'S' ? `
                  <div class="sea-hexagon"></div>
                  <div class="beaches">
                    ${Object.values(CONST.DIR_HELPER.KEYS).map((beach_dir, i) => `
                      <div class="beach beach-${i % 3 + 1} beach-${beach_dir}"></div>
                    `).join('')}
                  </div>
                ` : ''}
                <div class="background"></div>
              </div>
              <div class="tile-text">${t_name}</div>
            </div>
          `).join('')}
          <div class="cancel-container"><div class="button text">Close</div></div>
        </div>
        <div class="select-number">
          <div class="number-slider-container">
            <div class="number-slider-line">
              ${Array.from({ length: 10 }).map((_, i) =>`
                <div style="left: ${i * 100 / 9}%"></div>
              `).join('')}
            </div>
            <div class="number-slider-thumb" data-num="6"></div>
            <input class="number-slider-input" type="range" value="6" min="2" max="11" step="1">
            <div class="probability-text">
              ${[...Array(11).keys()].map(n => n + 2).filter(n => n !== 7).map(n => `
                <span data-p-num="${n}">
                  Rolling Chance:
                  <b>${((7 - Math.abs(7 - n) - 1) / 36 * 100).toFixed(1)}%</b>
                  (${7 - Math.abs(7 - n) - 1}/36)
                </span>
              `).join('')}
            </div>
          </div>
          <div class="tile-container">
            <div class="tile">
              <div class="background"></div>
              <div class="number" data-num="6" data-dots="....."></div>
            </div>
            <div class="tile-text">Pick</div>
          </div>
        </div>
        <div class="select-trade">
          ${Object.entries(CONST.TRADE_OFFERS).map(([t_key, t_name]) => ['Px', '*4'].includes(t_key)  ? '' : `
            <div class="trade-container ${t_key}" data-type="${t_key}">
              <div class="trade-type ${t_key.replace(/\*/, '_')}" data-type="${t_key}"></div>
              <div class="trade-text">${t_name}</div>
            </div>
          `).join('')}
          <div class="trade-container" data-type="--">
            <div class="tile S">
              <div class="background"></div>
              <div class="sea-hexagon"></div>
              <div class="beaches">
                ${Object.values(CONST.DIR_HELPER.KEYS).map((beach_dir, i) => `
                  <div class="beach beach-${i % 3 + 1} beach-${beach_dir}"></div>
                `).join('')}
              </div>
              <div class="no-trade-text">No<br/>Trade</div>
            </div>
          </div>
          <div class="cancel-container"><div class="button text">Close</div></div>
        </div>
        <div class="select-trade-direction">
          ${Object.values(CONST.DIR_HELPER.KEYS).map(trade_dir => `
            <div class="trade-direction-container" data-trade-dir="${trade_dir}">
              <div class="tile S" data-trade="*" data-trade-dir="${trade_dir}">
                <div class="sea-hexagon"></div>
                <div class="background"></div>
                ${CONST.DIR_HELPER.EDGE_TO_CORNERS[trade_dir].map(trade_post_dir =>
                  `<div class="trade-post p-${trade_post_dir}"></div>`
                ).join('')}
                <div class="beaches">
                  ${Object.values(CONST.DIR_HELPER.KEYS).map((beach_dir, i) => `
                    <div class="beach beach-${i%3 + 1} beach-${beach_dir}"></div>
                  `).join('')}
                </div>
              </div>
              <div class="trade-dir-text">${trade_dir.replace('_', ' ')}</div>
            </div>
          `).join('')}
          <div class="cancel-container"><div class="button text">Close</div></div>
        </div>
      </div>
    `

    this.$tile_selector = this.$tile_selection_container.querySelector('#tile-selector')
    this.$mapkey_textarea = this.$el.querySelector('textarea')
    this.$shuffle_tiles = this.$el.querySelector('#shuffle-tiles')
    this.$shuffle_numbers = this.$el.querySelector('#shuffle-numbers')
    this.$shuffle_ports = this.$el.querySelector('#shuffle-ports')
    this.#setupEvents()
    this.#setupBoardClickEvent()
  }

  #setupEvents() {
    window.addEventListener('popstate', () => {
      this.updateBoard((new URLSearchParams(window.location.search)).get('mapkey') || CONST.GAME_CONFIG.mapkey, true)
    })

    this.$el.querySelector('.button.shuffle').addEventListener('click', e => {
      this.shuffle({
        mapkey: this.$mapkey_textarea.value,
        tile: this.$shuffle_tiles.checked,
        number: this.$shuffle_numbers.checked,
        port: this.$shuffle_ports.checked,
      })
    })

    this.$el.querySelector('.button.reset').addEventListener('click', e => {
      this.updateBoard(CONST.GAME_CONFIG.mapkey)
      this.updateURL('')
    })

    this.$el.querySelector('.button.copy').addEventListener('click', e => {
      window.navigator.clipboard.writeText(window.location.href)
      e.target.classList.add('copied')
      setTimeout(_ => e.target.classList.remove('copied'), 1500)
    })
    // this.$el.querySelector('.button.copy').addEventListener('mouseout', e => {
    //   e.target.classList.remove('copied')
    // })

    this.$el.querySelector('.button.render').addEventListener('click', e => {
      try { this.updateBoard(this.$mapkey_textarea.value) }
      catch(e) { window.alert(e) }
    })

    // Play this Map (inside shuffler container)
    const $playersSelect = this.$el.querySelector('#players-select')
    const $winPointsSelect = this.$el.querySelector('#winpoints-select')
    this.$el.querySelector('.button.play')?.addEventListener('click', e => {
      const hostName = (localStorage.getItem('player-name') || 'Editor Host').trim() || 'Editor Host'
      const players = +($playersSelect?.value || 3)
      const win_points = +($winPointsSelect?.value || CONST.GAME_CONFIG.win_points)
      const mapkey = (this.$mapkey_textarea?.value || this.board?.mapkey || CONST.GAME_CONFIG.mapkey)
      const config = { mapkey, win_points, map_shuffle: 'none' }
      const configParam = encodeURIComponent(JSON.stringify(config))
      const href = `/game/new?name=${encodeURIComponent(hostName)}&players=${encodeURIComponent(players)}&config=${configParam}`
      window.open(href, '_blank')
    })

    this.$el.querySelector('#toggle-edit-input').addEventListener('change', e => {
      $('#game').classList.toggle('board--editing')
      this.$tile_selector.classList.toggle('open')
      this.#resetBoardEdit()
    })

    this.$tile_selector.querySelectorAll('.select-tiles .tile-container').forEach($tile => {
      $tile.addEventListener('click', e => {
        this.onTileSelection(e.currentTarget.dataset.type)
      })
    })

    this.$tile_selector.querySelector('.select-number .number-slider-input').addEventListener('input', e => {
      this.onNumberSlider(e.currentTarget.value)
    }, false)

    this.$tile_selector.querySelector('.select-number .tile-container').addEventListener('click', e => {
      this.changeTile()
    })

    this.$tile_selector.querySelectorAll('.select-trade .trade-container').forEach($tile => {
      $tile.addEventListener('click', e => {
        this.onTradeSelection(e.currentTarget.dataset.type)
      })
    })

    this.$tile_selector.querySelectorAll('.select-trade-direction .trade-direction-container').forEach($tile => {
      $tile.addEventListener('click', e => {
        this.onTradeDirSelection(e.currentTarget.dataset.tradeDir)
      })
    })

    this.$tile_selector.querySelectorAll('.cancel-container .button').forEach($cancel => {
      $cancel.addEventListener('click', e => {
        // $('#game').classList.remove('board--editing')
        // this.$tile_selector.classList.remove('open')
        // this.$el.querySelector('#toggle-edit-input').checked = false
        // simulate the checkbox change instead
        this.#resetBoardEdit()
      })
    })
  }

  #setupBoardClickEvent() {
    this.board_ui.$el.querySelectorAll('.tile').forEach($tile => {
      $tile.addEventListener('click', e => {
        if (!$('#game').classList.contains('board--editing')) return
        this.onBoardClick(+e.currentTarget.dataset.id)
      })
    })
  }

  #resetBoardEdit() {
    this.board_ui.$el.querySelector('.tile.picked')?.classList.remove('picked')
    this.$tile_selector.dataset.mode = "start"
    const $slider = this.$tile_selector.querySelector('.select-number .number-slider-input')
    $slider.value = 6
    $slider.dispatchEvent(new Event('input'))
  }

  onBoardClick(id) {
    this.tile_selection_obj = { id, number: 6 }
    this.board_ui.$el.querySelector('.tile.picked')?.classList.remove('picked')
    this.board_ui.$el.querySelector(`.tile[data-id="${id}"]`).classList.add('picked')
    this.$tile_selector.dataset.mode = "tiles"
    const tile = this.board.findTile(id)
    Object.keys(CONST.DIR_HELPER.MAPKEYS).map(dir => {
      const dir_tile = tile.adjacent_tiles[dir]
      this.$tile_selector.dataset[`land_${dir}`] = !!(dir_tile && dir_tile?.type !== 'S')
    })
  }

  onTileSelection(type) {
    this.tile_selection_obj.type = type
    if (type === 'S') {
      this.$tile_selector.dataset.mode = "trade"
    } else if(type === 'D') {
      this.changeTile()
    } else {
      this.$tile_selector.dataset.mode = "number"
      this.$tile_selector.dataset.tile = type
    }
  }

  onNumberSlider(value) {
    const num = value > 6 ? +value + 1 : value
    const $slider_thumb = this.$tile_selector.querySelector('.select-number .number-slider-thumb')
    const $tile_num = this.$tile_selector.querySelector('.select-number .tile .number')
    $tile_num.dataset.num = $slider_thumb.dataset.num = num
    $slider_thumb.style.left = `${(value - 2) * 100 / 9}%`
    $tile_num.dataset.dots = '.'.repeat(6 - Math.abs(7 - num))
    this.tile_selection_obj.number = num
  }

  onTradeSelection(type) {
    if (type === '--') {
      // No trade in Sea
      return this.changeTile()
    }
    this.$tile_selector.dataset.mode = "trade-direction"
    this.$tile_selector.dataset.tradeType = type
    this.tile_selection_obj.trade_type = type
  }

  onTradeDirSelection(dir) {
    this.tile_selection_obj.trade_dir = dir
    this.changeTile()
  }

  changeTile() {
    /**
     * Change the tile data
     * Add adjacent sea if not available (auto-expand borders)
     * Re-render board
     * Update mapkey in input and url
     */
    const new_tile = this.tile_selection_obj
    const tile = this.board.findTile(new_tile.id)
    tile.type = new_tile.type
    tile.num = tile.type !== 'S' && tile.type !== 'D' && new_tile.number
    if (tile.type === 'S') {
      tile.trade_edge = new_tile.trade_dir
      tile.trade_type = new_tile.trade_type?.replace(/\d+/, '')
      tile.trade_ratio = new_tile.trade_type?.replace(/[^\d]+/, '')
    }

    // Generate mapkey from current (mutated) board
    let new_mapkey = this.board.generateMapKey()

    // Auto-add surrounding sea tiles when changing to land/desert
    if (tile.type !== 'S') {
      new_mapkey = this.#expandSeaBordersAroundTile(tile)
    }

    this.updateBoard(new_mapkey)
    this.#resetBoardEdit()
  }

  /**
   * Ensure that there are Sea (S) tiles surrounding a newly placed land/desert tile
   * - Adds S tiles to the above and below rows as needed
   * - Adds an S tile at the end of the current edited row when needed
   * This is a minimal, mapkey-only expansion; full graph is rebuilt via updateBoard()
   */
  #expandSeaBordersAroundTile(tile) {
    // Build rows with diff signs preserved and tokens split
    const mk = this.board.generateMapKey()
    const raw_rows = mk.split('\n')
    const rows = raw_rows.map((rowStr, i) => {
      if (!i) { return { sign: '', diff: 1, tokens: rowStr.split('.') } }
      const sign = rowStr[0]
      const diff = sign === '+' ? 1 : -1
      const rest = rowStr.slice(1)
      return { sign, diff, tokens: rest.split('.') }
    })

    // Find (r,c) of the edited tile via board.tile_rows
    let r = -1, c = -1
    for (let i = 0; i < this.board.tile_rows.length; i++) {
      const idx = this.board.tile_rows[i].indexOf(tile)
      if (idx !== -1) { r = i; c = idx; break }
    }
    if (r === -1 || c === -1) return mk // fallback

    // Extend current row end if edited tile is at the end
    if (c === rows[r].tokens.length - 1) {
      rows[r].tokens.push('S')
    }

    // Helper to ensure index exists within a row by pushing/adding S
    const ensureIndex = (rowObj, idx) => {
      if (!rowObj) return
      if (idx < 0) {
        // Prepend required S tiles
        let cnt = -idx
        while (cnt--) { rowObj.tokens.unshift('S') }
        return 0
      }
      if (idx >= rowObj.tokens.length) {
        while (rowObj.tokens.length <= idx) { rowObj.tokens.push('S') }
      }
      return idx
    }

    // Above row: ensure top-left and top-right exist
    if (rows[r - 1]) {
      const rowDiffTmp = rows[r].diff < 0 ? -1 : 0
      let tli = c + rowDiffTmp
      let tri = tli + 1
      if (tli < 0) {
        // Prepend to previous row so that tli becomes 0
        const delta = -tli
        for (let k = 0; k < delta; k++) rows[r - 1].tokens.unshift('S')
        tli = 0
        tri = 1
      }
      if (tri >= rows[r - 1].tokens.length) {
        while (rows[r - 1].tokens.length <= tri) rows[r - 1].tokens.push('S')
      }
    }

    // Below row: ensure bottom-left and bottom-right exist
    if (rows[r + 1]) {
      const nextRowDiffTmp = rows[r + 1].diff < 0 ? -1 : 0
      let brIdx = c - nextRowDiffTmp
      let blIdx = brIdx - 1
      if (blIdx < 0) {
        const delta = -blIdx
        for (let k = 0; k < delta; k++) rows[r + 1].tokens.unshift('S')
        blIdx = 0
        brIdx = 1
      }
      if (brIdx >= rows[r + 1].tokens.length) {
        while (rows[r + 1].tokens.length <= brIdx) rows[r + 1].tokens.push('S')
      }
    }

    // New requirement: when adding a land/desert tile, add a new row of all S tiles
    // - If editing on the topmost row, prepend a full S row
    // - If editing on the bottommost row, append a full S row
    if (r === 0) {
      const newLenTop = rows[r].tokens.length
      rows.unshift({ sign: '', diff: 1, tokens: Array(newLenTop).fill('S') })
      r += 1 // original row index shifted down by 1
    }
    if (r === rows.length - 1) {
      const newLenBottom = rows[r].tokens.length
      const lastSign = rows[r].sign || '+'
      rows.push({ sign: lastSign, diff: lastSign === '-' ? -1 : 1, tokens: Array(newLenBottom).fill('S') })
    }

    // Re-serialize rows into a mapkey string
    const new_mk = rows.map((row, i) => {
      const rowKey = row.tokens.join('.')
      return i === 0 ? rowKey : (row.sign || '+') + rowKey
    }).join('\n')

    return new_mk
  }

  shuffle({ mapkey, tile, number, port }) {
    let shuffle_options = []
    tile && shuffle_options.push('tile')
    number && shuffle_options.push('number')
    port && shuffle_options.push('port')
    const shuffled_mapkey = (new BoardShuffler(mapkey)).shuffle(shuffle_options.join('-'))
    this.updateBoard(shuffled_mapkey.replace(/([+|-])/g, '\n$1'))
  }

  updateBoard(mapkey, no_url) {
    this.$mapkey_textarea.value = mapkey
    !no_url && this.updateURL(mapkey)
    this.board = new Board(mapkey)
    this.board_ui = new MapBuilderBoardUI(this.board, dummyFn)
    this.board_ui.render()
    this.#setupBoardClickEvent()
    // Keep the Play link in sync with the current map
    this.updatePlayLinkHref && this.updatePlayLinkHref()
  }

  updateURL(mapkey) {
    const url = new URL(window.location.href)
    url.searchParams.set('mapkey', mapkey)
    window.history.pushState({}, null, url.href)
  }

  injectGameLinkInInfo() {
    const div = document.createElement('div')
    div.className = 'play-full-game'

    // Create a dynamic link that will start a game with the current editor map
    const a = document.createElement('a')
    a.target = '_blank'
    a.textContent = 'Play this Map'
    a.id = 'play-this-map-link'

    // Small helper to build href from current mapkey
    const buildHref = () => {
      const hostName = (localStorage.getItem('player-name') || 'Editor Host').trim() || 'Editor Host'
      const players = 3 // default to 3 players to avoid auto-upsize overrides
      const mapkey = (this.$mapkey_textarea?.value || this.board?.mapkey || CONST.GAME_CONFIG.mapkey)
      const config = { mapkey, map_shuffle: 'none' }
      const configParam = encodeURIComponent(JSON.stringify(config))
      return `/game/new?name=${encodeURIComponent(hostName)}&players=${encodeURIComponent(players)}&config=${configParam}`
    }

    // Store for later updates
    this.$play_link = a
    a.href = buildHref()

    // Optional: also keep the original link to the homepage
    const home = document.createElement('a')
    home.href = '/login'
    home.textContent = 'Open Game Home'
    home.style.marginLeft = '12px'

    div.appendChild(a)
    div.appendChild(home)
    this.accessibility_ui.$el.querySelector('.info-zone').prepend(div)

    // Expose an updater
    this.updatePlayLinkHref = () => {
      if (this.$play_link) this.$play_link.href = buildHref()
    }
  }
}

window.shuffler = new Shuffler()
