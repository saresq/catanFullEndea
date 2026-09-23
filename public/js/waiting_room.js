import * as CONST from "./const.js"
import { t } from "./i18n.js"
import AudioManager from "./audio_manager.js"
import AccessibilityUI from "./ui/accessibility_ui.js"
const $ = document.querySelector.bind(document)

class WaitingRoomUI {
  player_count = window.player_count
  $joined_count = document.querySelector('.box-header .p-count')
  $game_key = $('#waiting-room .title .text')
  escCloser = e => { if (e.key === 'Escape') this.closePicker() }

  constructor() {
    this.socket = window.io()
    this.audio_manager = new AudioManager()
    this.accessibility_ui = new AccessibilityUI({
      toggleBgm: allow => this.audio_manager.toggleBgm(allow),
      quit_label: t('menu.leave'),
      icons: { zoom: false, notifcation_sounds: false, shorcuts: false }
    })
    this.accessibility_ui.render()

    // Set room info
    const $ms = document.getElementById('map-size')
    const $vp = document.getElementById('win-points')
    $ms && ( $ms.textContent = t('names.maps.' + window.map_size) )
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
          this.$start_btn.textContent = t('lobby.starting')
        }
      })
    }

    // Own slot opens the colour picker; the host's bot controls live on empty and bot slots.
    // Bound once, survives every re-render
    $('#slots-list').addEventListener('click', e => {
      const $add = e.target.closest('.add-bot')
      const $remove = e.target.closest('.remove-bot')
      const $dot = e.target.closest('.level-dots button')
      if (!this.is_host && ($add || $remove || $dot)) return
      if ($add) { this.socket.emit(CONST.SOCKET_EVENTS.ADD_BOT, CONST.DEFAULT_BOT_LEVEL); return }
      if ($remove) { this.socket.emit(CONST.SOCKET_EVENTS.REMOVE_BOT, +$remove.dataset.pid); return }
      if ($dot) { this.socket.emit(CONST.SOCKET_EVENTS.SET_BOT_LEVEL, +$dot.closest('.level-dots').dataset.pid, $dot.dataset.level); return }
      if (e.target.closest('.slot.me')) this.openColorPicker(this.getTakenColors())
    })
    $('#slots-list').addEventListener('change', e => {
      const $select = e.target.closest('.level-select')
      if ($select && this.is_host) this.socket.emit(CONST.SOCKET_EVENTS.SET_BOT_LEVEL, +$select.dataset.pid, $select.value)
    })

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
      // The host left: the room passed to someone else, and the page is rendered per host
      if (pid === this.host_pid) { window.location.reload(); return }
      this.removePlayer(pid)
      this.renderSlots()
      this.updateStartBtnState()
    })

    this.$game_key.addEventListener('click', () => this.shareInvite())

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

  /** Phones get the share sheet; everything else copies the link and says so in the caption. */
  async shareInvite() {
    const url = window.location.href
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: t('page.title'), text: t('lobby.share_text'), url }); return } catch (e) {
        if (e.name === 'AbortError') return
      }
    }
    const $caption = $('#game-key-caption')
    let copied = true
    try { await navigator.clipboard.writeText(url) } catch (e) { copied = false }
    if (!copied) { getSelection().selectAllChildren(this.$game_key.firstElementChild) }
    $caption.textContent = copied ? t('lobby.link_copied') : t('lobby.key_selected')
    this.$game_key.classList.toggle('copied', copied)
    clearTimeout(this.copy_timer)
    this.copy_timer = setTimeout(() => {
      $caption.textContent = t('lobby.game_key')
      this.$game_key.classList.remove('copied')
    }, 2500)
  }

  closePicker() {
    document.querySelector('.picker-overlay')?.remove()
    document.removeEventListener('keydown', this.escCloser)
  }
  closeColorPicker() { this.closePicker() }

  /** Sand panel over the room, closed by its Cancel, a click outside or Escape. */
  #openOverlay(html) {
    this.closePicker()
    const overlay = document.createElement('div')
    overlay.className = 'picker-overlay'
    overlay.innerHTML = `<div class="picker panel" role="dialog" aria-modal="true" tabindex="-1">${html}</div>`
    document.body.appendChild(overlay)
    overlay.addEventListener('click', (e) => {
      if (e.target.classList.contains('close') || e.target === overlay) this.closePicker()
    })
    document.addEventListener('keydown', this.escCloser)
    // Focus the panel, not an option: a focused option reads as already chosen
    overlay.querySelector('.picker').focus({ preventScroll: true })
    return overlay
  }

  openColorPicker(takenColors = new Set()) {
    const overlay = this.#openOverlay(`
        <div class="title">${t('lobby.choose_color')}</div>
        <div class="grid">
          ${CONST.COLOR_IDS.map(i=>`
            <div class="color-option ${takenColors.has(i) ? 'taken' : ''}" data-id="${i}"
                 style="background-image:url('/images/pieces/city-${i}.png')" title="${t('lobby.color_n', { n: i })}"></div>
          `).join('')}
        </div>
        <button class="btn btn--secondary btn--sm close">${t('lobby.cancel')}</button>`)
    overlay.querySelectorAll('.color-option:not(.taken)')
      .forEach(el => el.addEventListener('click', e => {
        const cid = +e.currentTarget.dataset.id
        this.socket.emit(CONST.SOCKET_EVENTS.PLAYER_COLOR_CHANGE, cid)
        this.closePicker()
      }))
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

    CONST.MAP_LIST.forEach(map => {
      const option = document.createElement('option')
      option.value = map.mapkey
      option.textContent = t('names.maps.' + map.id)
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

      $mapSelect.value = CONST.MAPS[window.map_size]?.mapkey || window.mapkey || CONST.DEFAULT_MAPKEY
      $winPointsSelect.value = window.win_points
      this.updateMaxPlayersSelect()
      $maxPlayersSelect.value = window.player_count
      $diceModeSelect.value = window.dice_mode || 'random'

      const emitConfig = () => {
        this.socket.emit(CONST.SOCKET_EVENTS.CHANGE_CONFIG, {
          mapkey: $mapSelect.value,
          map_size: CONST.mapId($mapSelect.value),
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
    $("#map-size").textContent = t('names.maps.' + window.map_size)
    $('#win-points').textContent = window.win_points
    $('#max-players-val').textContent = window.player_count
    $('#dice-mode-val').textContent = t('names.dice_modes.' + (window.dice_mode || 'random'))

    this.socket.on(CONST.SOCKET_EVENTS.CHANGE_CONFIG, config => {
      const { player_count, win_points, mapkey, map_size, dice_mode } = config
      window.player_count = player_count
      this.player_count = player_count
      window.win_points = win_points
      window.map_size = map_size

      if (this.is_host) {
        $mapSelect.value = CONST.MAPS[map_size]?.mapkey || mapkey
        $winPointsSelect.value = win_points
        this.updateMaxPlayersSelect()
        $maxPlayersSelect.value = player_count
        $diceModeSelect.value = dice_mode
      }

      $('#map-size').textContent = t('names.maps.' + map_size)
      $('#win-points').textContent = win_points
      $('#max-players-val').textContent = player_count
      $('#dice-mode-val').textContent = t('names.dice_modes.' + dice_mode)

      this.updateJoinedCount()

      this.renderSlots()
      this.updateStartBtnState()
    })
  }

  addPlayer({ id, name, color_id, is_bot, bot_level }) {
    // Keep global list updated for rendering
    window.players = window.players || []
    window.players[id - 1] = { id, name, color_id, is_bot: !!is_bot, bot_level: bot_level || null }
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
    this.$start_btn.textContent = full ? t('lobby.start_game') : t('lobby.waiting', { n: this.player_count - joined })
  }

  /**
   * A bot's level as dots: one filled per step up to its level. The host's dots are buttons (the
   * n-th sets the n-th level); a level that does not exist yet is shown, but cannot be chosen.
   */
  levelDots(p) {
    const levels = CONST.BOT_LEVELS
    const current = Math.max(0, levels.findIndex(l => l.id === p.bot_level))
    const name = levels[current]?.name || p.bot_level
    const dots = levels.map((l, i) => {
      const cls = `dot${i <= current ? ' filled' : ''}${l.available ? '' : ' unavailable'}`
      if (!this.is_host) return `<span class="${cls}"></span>`
      const label = t(l.available ? 'lobby.bot_level' : 'lobby.bot_level_not_ready', { name: l.name })
      return `<button type="button" class="${cls}" data-level="${l.id}" aria-label="${label}" title="${label}"
        aria-pressed="${l.id === p.bot_level}" ${l.available ? '' : 'disabled'}></button>`
    }).join('')
    return `<span class="level-dots" data-pid="${p.id}" role="${this.is_host ? 'group' : 'img'}" aria-label="${t('lobby.bot_level', { name })}">${dots}</span>`
  }

  /**
   * The host's level picker on touch screens: a native select, since three dots are too small a
   * target for a thumb. CSS swaps it with the dots below the tablet breakpoint.
   */
  levelSelect(p) {
    const options = CONST.BOT_LEVELS.map(l =>
      `<option value="${l.id}" ${l.id === p.bot_level ? 'selected' : ''} ${l.available ? '' : 'disabled'}>${l.available ? l.name : t('lobby.not_ready', { name: l.name })}</option>`
    ).join('')
    return `<select class="field level-select" data-pid="${p.id}" aria-label="${t('lobby.level_of_bot', { name: p.name })}">${options}</select>`
  }

  renderSlots() {
    const $list = document.getElementById('slots-list')
    if (!$list) return
    const items = Array.from({ length: this.player_count }, (_, i) => {
      const p = (window.players || [])[i]
      if (p && p.name) {
        const cid = p.color_id || p.id
        const me = this.my_pid && this.my_pid === p.id
        const tag = me ? `button type="button" title="${t('lobby.choose_color_title')}"` : 'div'
        // A bot is marked by the robot and its level as filled dots, not by its colour; the host
        // sets the level on the dots and can send the bot away
        const bot = p.is_bot ? `${CONST.BOT_ICON}${this.levelDots(p)}${this.is_host ? this.levelSelect(p) : ''}` : ''
        const remove = p.is_bot && this.is_host
          ? `<button type="button" class="btn btn--quiet btn--sm remove-bot" data-pid="${p.id}" aria-label="${t('lobby.remove_bot_aria', { name: p.name })}" title="${t('lobby.remove_bot')}">${CONST.CLOSE_ICON}</button>`
          : ''
        return `<${tag} class="slot filled ${me ? 'me' : ''} ${p.is_bot ? 'bot' : ''} p${p.id} pc${cid}" data-pid="${p.id}">
          <span class="city-icon" style="background-image:url('/images/pieces/city-${cid}.png')"></span>
          <span class="name">${p.name}</span>${bot}${remove}
        </${me ? 'button' : 'div'}>`
      }
      // The host fills an empty seat with a bot; its level is set on the slot afterwards
      const add = this.is_host
        ? `<button type="button" class="btn btn--secondary btn--sm add-bot">${CONST.BOT_ICON}${t('lobby.add_bot')}</button>`
        : ''
      return `<div class="slot empty"><span class="empty-label">${t('lobby.empty_slot')}</span>${add}</div>`
    }).join('')
    $list.innerHTML = items
    // Only a seated player has a row to click; spectators never see the hint
    const $hint = document.getElementById('color-hint')
    if ($hint) { $hint.hidden = !this.my_pid }

    // Update remaining count after rerender (in case of initial render)
    this.updateJoinedCount()
  }
}

new WaitingRoomUI()
