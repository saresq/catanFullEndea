import * as CONST from "./const.js"
import AudioManager from "./audio_manager.js"
import AccessibilityUI from "./ui/accessibility_ui.js"
const $ = document.querySelector.bind(document)

class WaitingRoomUI {
  player_count = window.player_count
  joined_count = 0
  $joined_count = document.querySelector('.box-header .p-count')
  $game_key = $('.title .text')

  constructor() {
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
          window.io().emit(CONST.SOCKET_EVENTS.START_GAME)
          this.$start_btn.disabled = true
          this.$start_btn.textContent = 'Starting…'
        }
      })
    }

    // Initialize from existing players array
    window.players.forEach(p => p && this.addPlayer(p))
    this.renderSlots()
    this.updateStartBtnState()

    /** @event Player-Join */
    window.io().on(CONST.SOCKET_EVENTS.JOINED_WAITING_ROOM, player => {
      this.addPlayer(player)
      this.renderSlots()
      this.updateStartBtnState()
    })

    /** @event Player-Quit */
    window.io().on(CONST.SOCKET_EVENTS.PLAYER_QUIT, pid => {
      this.removePlayer(pid)
      this.renderSlots()
      this.updateStartBtnState()
    })

    this.$game_key.addEventListener('click', e => {
      window.navigator.clipboard.writeText(window.game_id)
      this.$game_key.classList.add('copied')
    })
    this.$game_key.addEventListener('mouseout', e => this.$game_key.classList.remove('copied'))

    // Listen for color updates from server
    window.io().on(CONST.SOCKET_EVENTS.PLAYER_COLOR_UPDATED, (pid, color_id) => {
      window.players = window.players || []
      if (window.players[pid - 1]) {
        window.players[pid - 1].color_id = color_id
      }
      this.renderSlots()
    })

    // Listen for game start (state change) to transition into game view
    window.io().on(CONST.SOCKET_EVENTS.STATE_CHANGE, (state /*, active_pid */) => {
      if (state) {
        $('#waiting-room')?.classList.add('hide')
        setTimeout(() => window.location.reload(), 300)
      }
    })

    // Helpers to open/close color picker
    this.closeColorPicker = () => {
      document.querySelector('.color-picker-overlay')?.remove()
      document.removeEventListener('keydown', this._escCloser)
    }
    this._escCloser = (e) => { if (e.key === 'Escape') this.closeColorPicker() }

    this.openColorPicker = (takenColors = new Set()) => {
      const overlay = document.createElement('div')
      overlay.className = 'color-picker-overlay'
      overlay.innerHTML = `
        <div class="picker">
          <div class="title">Choose your color</div>
          <div class="grid">
            ${Array.from({length: 8}, (_,i)=>i+1).map(i=>`
              <div class="color-option ${takenColors.has(i) ? 'taken' : ''}" data-id="${i}"
                   style="background-image:url('/images/pieces/city-${i}.png')" title="Color ${i}"></div>
            `).join('')}
          </div>
          <button class="close">Cancel</button>
        </div>`
      document.body.appendChild(overlay)
      overlay.addEventListener('click', (e) => {
        if (e.target.classList.contains('close') || e.target === overlay) this.closeColorPicker()
      })
      overlay.querySelectorAll('.color-option:not(.taken)')
        .forEach(el => el.addEventListener('click', e => {
          const cid = +e.currentTarget.dataset.id
          window.io().emit(CONST.SOCKET_EVENTS.PLAYER_COLOR_CHANGE, cid)
          this.closeColorPicker()
        }))
      document.addEventListener('keydown', this._escCloser)
    }

    this.getTakenColors = () => {
      const set = new Set()
      ;(window.players||[]).forEach(p => { if (p && p.id !== this.my_pid && p.color_id) set.add(p.color_id) })
      return set
    }
  }

  checkAndEnd() {
    if (this.joined_count === this.player_count) {
      // Brief transition before game loads
      $('#waiting-room').classList.add('hide')
      setTimeout(_ => window.location.reload(), 500)
    }
  }

  addPlayer({ id, name, color_id }) {
    // Update counters
    this.joined_count++
    if (this.$joined_count) this.$joined_count.textContent = (this.player_count - this.joined_count)
    // Keep global list updated for rendering
    window.players = window.players || []
    window.players[id - 1] = { id, name, color_id }
  }

  removePlayer(pid) {
    this.joined_count = Math.max(0, this.joined_count - 1)
    if (this.$joined_count) this.$joined_count.textContent = (this.player_count - this.joined_count)
    if (Array.isArray(window.players)) {
      delete window.players[pid - 1]
    }
  }

  updateStartBtnState() {
    if (!this.$start_btn) return
    const joined = (window.players || []).filter(Boolean).length
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
        return `<div class="slot filled p${p.id} ${p.color_id ? 'pc' + p.color_id : ''}" data-pid="${p.id}">
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
    if (this.$joined_count) this.$joined_count.textContent = (this.player_count - (window.players || []).filter(Boolean).length)
  }
}

new WaitingRoomUI()
