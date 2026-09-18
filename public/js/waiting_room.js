import * as CONST from "./const.js"
import AudioManager from "./audio_manager.js"
import AccessibilityUI from "./ui/accessibility_ui.js"
const $ = document.querySelector.bind(document)

class WaitingRoomUI {
  player_count = window.player_count
  $joined_count = document.querySelector('.box-header .p-count')
  $game_key = $('.title .text')
  escCloser = e => { if (e.key === 'Escape') this.closeColorPicker() }

  constructor() {
    this.socket = window.io()
    this.audio_manager = new AudioManager()
    this.accessibility_ui = new AccessibilityUI({
      toggleBgm: allow => this.audio_manager.toggleBgm(allow),
      icons: { zoom: false, notifcation_sounds: false, shorcuts: false }
    })
    this.accessibility_ui.render()

    // Set room info
    const $ms = document.getElementById('map-size')
    const $vp = document.getElementById('win-points')
    $ms && ( $ms.textContent = window.map_size )
    $vp && ( $vp.textContent = window.win_points )

    // Determine my player id (prefer injected value; fallback to cookie parsing)
    const injectedPid = (typeof window !== 'undefined' && window.my_pid) ? parseInt(window.my_pid, 10) : null
    if (injectedPid && !isNaN(injectedPid)) {
      this.my_pid = injectedPid
    } else {
      try {
        const m = document.cookie.match(/(?:^|; )player_id=(\d+)/)
        this.my_pid = m ? +m[1] : null
      } catch (e) { this.my_pid = null }
    }
    // Determine host id
    this.host_pid = (typeof window !== 'undefined' && window.host_pid) ? parseInt(window.host_pid, 10) : null
    this.is_host = !!(this.host_pid && this.my_pid && this.host_pid === this.my_pid)
    this.$start_btn = document.getElementById('start-game-btn')
    if (this.$start_btn) {
      // Hide button for non-hosts
      if (!this.is_host) { this.$start_btn.classList.add('hide') }
      this.$start_btn.addEventListener('click', () => {
        if (this.is_host && !this.$start_btn.disabled) {
          this.socket.emit(CONST.SOCKET_EVENTS.START_GAME)
          this.$start_btn.disabled = true
          this.$start_btn.textContent = 'Starting…'
        }
      })
    }

    // Initialize from existing players array
    window.players.forEach(p => p && this.addPlayer(p))
    this.renderSlots()
    this.updateStartBtnState()
    this.initLobbySettings()

    // Initialize spectator count
    if (window.spectators_count) {
      const $spec = $('#spectator-list')
      if ($spec) {
        $spec.classList.remove('hide')
        $spec.querySelector('span').textContent = window.spectators_count
      }
    }

    /** @event Player-Join */
    this.socket.on(CONST.SOCKET_EVENTS.JOINED_WAITING_ROOM, player => {
      this.addPlayer(player)
      this.renderSlots()
      this.updateStartBtnState()
    })

    /** @event Player-Quit */
    this.socket.on(CONST.SOCKET_EVENTS.PLAYER_QUIT, pid => {
      this.removePlayer(pid)
      this.renderSlots()
      this.updateStartBtnState()
    })

    this.$game_key.addEventListener('click', e => {
      window.navigator.clipboard.writeText(window.location.href)
      this.$game_key.classList.add('copied')
    })
    this.$game_key.addEventListener('mouseout', e => this.$game_key.classList.remove('copied'))

    $('.leave-lobby')?.addEventListener('click', e => window.location.href = '/logout')

    // Listen for color updates from server
    this.socket.on(CONST.SOCKET_EVENTS.PLAYER_COLOR_UPDATED, (pid, color_id) => {
      window.players = window.players || []
      if (window.players[pid - 1]) {
        window.players[pid - 1].color_id = color_id
      }
      this.renderSlots()
    })

    // Listen for game start (state change) to transition into game view
    this.socket.on(CONST.SOCKET_EVENTS.STATE_CHANGE, (state /*, active_pid */) => {
      if (state) {
        $('#waiting-room')?.classList.add('hide')
        setTimeout(() => window.location.reload(), 300)
      }
    })

    /** @event Spectator-Count */
    this.socket.on(CONST.SOCKET_EVENTS.SPECTATOR_COUNT, count => {
      const $spec = $('#spectator-list')
      if (!$spec) return
      $spec.classList[count ? 'remove' : 'add']('hide')
      $spec.querySelector('span').textContent = count
    })

  }

  closeColorPicker() {
    document.querySelector('.color-picker-overlay')?.remove()
    document.removeEventListener('keydown', this.escCloser)
  }

  openColorPicker(takenColors = new Set()) {
    const overlay = document.createElement('div')
    overlay.className = 'color-picker-overlay'
    overlay.innerHTML = `
      <div class="picker">
        <div class="title">Choose your color</div>
        <div class="grid">
          ${CONST.COLOR_IDS.map(i=>`
            <div class="color-option ${takenColors.has(i) ? 'taken' : ''}" data-id="${i}"
                 style="background-image:url('/images/pieces/city-${i}.png')" title="Color ${i}"></div>
          `).join('')}
        </div>
        <button class="btn btn--secondary btn--sm close">Cancel</button>
      </div>`
    document.body.appendChild(overlay)
    overlay.addEventListener('click', (e) => {
      if (e.target.classList.contains('close') || e.target === overlay) this.closeColorPicker()
    })
    overlay.querySelectorAll('.color-option:not(.taken)')
      .forEach(el => el.addEventListener('click', e => {
        const cid = +e.currentTarget.dataset.id
        this.socket.emit(CONST.SOCKET_EVENTS.PLAYER_COLOR_CHANGE, cid)
        this.closeColorPicker()
      }))
    document.addEventListener('keydown', this.escCloser)
  }

  getTakenColors() {
    const set = new Set()
    ;(window.players || []).forEach(p => { if (p && p.id !== this.my_pid && p.color_id) set.add(p.color_id) })
    return set
  }

  joinedCount() { return (window.players || []).filter(Boolean).length }

  updateJoinedCount() {
    if (this.$joined_count) this.$joined_count.textContent = this.player_count - this.joinedCount()
  }

  initLobbySettings() {
    const $mapSelect = $('#map-size-select')
    const $winPointsSelect = $('#win-points-select')
    const $maxPlayersSelect = $('#max-players-select')
    const $diceModeSelect = $('#dice-mode-select')

    const mapKeyByName = {}
    CONST.MAP_LIST.forEach(map => {
      mapKeyByName[map.name] = map.mapkey
      const option = document.createElement('option')
      option.value = map.mapkey
      option.textContent = map.name
      $mapSelect.appendChild(option)
    })

    // Populate Win Points
    CONST.WIN_POINT_OPTIONS.forEach(i => {
      const opt = document.createElement('option')
      opt.value = opt.textContent = i
      $winPointsSelect.appendChild(opt)
    })

    this.updateMaxPlayersSelect = () => {
      if (!this.is_host) return
      const currentVal = +$maxPlayersSelect.value || window.player_count
      $maxPlayersSelect.innerHTML = ''
      CONST.PLAYER_COUNTS.filter(i => i >= this.joinedCount()).forEach(i => {
        const opt = document.createElement('option')
        opt.value = opt.textContent = i
        if (i === currentVal) opt.selected = true
        $maxPlayersSelect.appendChild(opt)
      })
    }

    if (this.is_host) {
      $mapSelect.classList.remove('hide'); $mapSelect.disabled = false
      $winPointsSelect.classList.remove('hide'); $winPointsSelect.disabled = false
      $maxPlayersSelect.classList.remove('hide'); $maxPlayersSelect.disabled = false
      $diceModeSelect.classList.remove('hide'); $diceModeSelect.disabled = false

      $('#map-size').classList.add('hide')
      $('#win-points').classList.add('hide')
      $('#max-players-val').classList.add('hide')
      $('#dice-mode-val').classList.add('hide')

      $mapSelect.value = mapKeyByName[window.map_size] || window.mapkey || CONST.DEFAULT_MAPKEY
      $winPointsSelect.value = window.win_points
      this.updateMaxPlayersSelect()
      $maxPlayersSelect.value = window.player_count
      $diceModeSelect.value = window.dice_mode || 'random'

      const emitConfig = () => {
        this.socket.emit(CONST.SOCKET_EVENTS.CHANGE_CONFIG, {
          mapkey: $mapSelect.value,
          map_size: CONST.mapName($mapSelect.value),
          win_points: +$winPointsSelect.value,
          player_count: +$maxPlayersSelect.value,
          dice_mode: $diceModeSelect.value,
        })
      }

      $mapSelect.addEventListener('change', emitConfig)
      $winPointsSelect.addEventListener('change', emitConfig)
      $maxPlayersSelect.addEventListener('change', emitConfig)
      $diceModeSelect.addEventListener('change', emitConfig)
    }

    // Set initial values
    $("#map-size").textContent = window.map_size
    $('#win-points').textContent = window.win_points
    $('#max-players-val').textContent = window.player_count
    $('#dice-mode-val').textContent = (window.dice_mode || 'random').charAt(0).toUpperCase() + (window.dice_mode || 'random').slice(1)

    this.socket.on(CONST.SOCKET_EVENTS.CHANGE_CONFIG, config => {
      const { player_count, win_points, mapkey, map_size, dice_mode } = config
      window.player_count = player_count
      this.player_count = player_count
      window.win_points = win_points
      window.map_size = map_size

      if (this.is_host) {
        $mapSelect.value = mapKeyByName[map_size] || mapkey
        $winPointsSelect.value = win_points
        this.updateMaxPlayersSelect()
        $maxPlayersSelect.value = player_count
        $diceModeSelect.value = dice_mode
      }

      $('#map-size').textContent = map_size
      $('#win-points').textContent = win_points
      $('#max-players-val').textContent = player_count
      $('#dice-mode-val').textContent = dice_mode.charAt(0).toUpperCase() + dice_mode.slice(1)

      this.updateJoinedCount()

      this.renderSlots()
      this.updateStartBtnState()
    })
  }

  addPlayer({ id, name, color_id }) {
    // Keep global list updated for rendering
    window.players = window.players || []
    window.players[id - 1] = { id, name, color_id }
    this.updateJoinedCount()
    this.updateMaxPlayersSelect?.()
  }

  removePlayer(pid) {
    if (Array.isArray(window.players)) {
      delete window.players[pid - 1]
    }
    this.updateJoinedCount()
    this.updateMaxPlayersSelect?.()
  }

  updateStartBtnState() {
    if (!this.$start_btn) return
    const joined = this.joinedCount()
    const full = joined === this.player_count
    if (!this.is_host) {
      this.$start_btn.classList.add('hide')
      return
    }
    this.$start_btn.classList.remove('hide')
    this.$start_btn.disabled = !full
    this.$start_btn.textContent = full ? 'Start Game' : `Waiting… (${this.player_count - joined})`
  }

  renderSlots() {
    const $list = document.getElementById('slots-list')
    if (!$list) return
    const items = Array.from({ length: this.player_count }, (_, i) => {
      const p = (window.players || [])[i]
      if (p && p.name) {
        const cid = p.color_id || p.id
        const clickable = (this.my_pid && this.my_pid === p.id)
        return `<div class="slot filled p${p.id} pc${p.color_id || p.id}" data-pid="${p.id}">
          <div class="city-icon ${clickable ? 'clickable' : ''}" data-pid="${p.id}"
               style="background-image:url('/images/pieces/city-${cid}.png')" title="${clickable ? 'Choose color' : 'Player color'}"></div>
          <div class="name">${p.name}</div>
        </div>`
      }
      return `<div class="slot empty"><div class="empty-label">Empty slot</div></div>`
    }).join('')
    $list.innerHTML = items

    // Attach click handlers for color picking (only self)
    $list.querySelectorAll('.city-icon.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const taken = this.getTakenColors()
        this.openColorPicker(taken)
      })
    })

    // Update remaining count after rerender (in case of initial render)
    this.updateJoinedCount()
  }
}

new WaitingRoomUI()
