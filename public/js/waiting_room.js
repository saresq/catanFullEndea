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

    // Initialize from existing players array
    window.players.forEach(p => p && this.addPlayer(p))
    this.renderSlots()
    this.checkAndEnd()

    /** @event Player-Join */
    window.io().on(CONST.SOCKET_EVENTS.JOINED_WAITING_ROOM, player => {
      this.addPlayer(player)
      this.renderSlots()
      this.checkAndEnd()
    })

    /** @event Player-Quit */
    window.io().on(CONST.SOCKET_EVENTS.PLAYER_QUIT, pid => {
      this.removePlayer(pid)
      this.renderSlots()
    })

    this.$game_key.addEventListener('click', e => {
      window.navigator.clipboard.writeText(window.game_id)
      this.$game_key.classList.add('copied')
    })
    this.$game_key.addEventListener('mouseout', e => this.$game_key.classList.remove('copied'))
  }

  checkAndEnd() {
    if (this.joined_count === this.player_count) {
      // Brief transition before game loads
      $('#waiting-room').classList.add('hide')
      setTimeout(_ => window.location.reload(), 500)
    }
  }

  addPlayer({ id, name }) {
    // Update counters
    this.joined_count++
    if (this.$joined_count) this.$joined_count.textContent = (this.player_count - this.joined_count)
    // Keep global list updated for rendering
    window.players = window.players || []
    window.players[id - 1] = { id, name }
  }

  removePlayer(pid) {
    this.joined_count = Math.max(0, this.joined_count - 1)
    if (this.$joined_count) this.$joined_count.textContent = (this.player_count - this.joined_count)
    if (Array.isArray(window.players)) {
      delete window.players[pid - 1]
    }
  }

  renderSlots() {
    const $list = document.getElementById('slots-list')
    if (!$list) return
    const items = Array.from({ length: this.player_count }, (_, i) => {
      const p = (window.players || [])[i]
      if (p && p.name) {
        return `<div class="slot filled p${p.id}"><div class="name">${p.name}</div></div>`
      }
      return `<div class="slot empty"><div class="empty-label">Empty slot</div></div>`
    }).join('')
    $list.innerHTML = items
    // Update remaining count after rerender (in case of initial render)
    if (this.$joined_count) this.$joined_count.textContent = (this.player_count - (window.players || []).filter(Boolean).length)
  }
}

new WaitingRoomUI()
