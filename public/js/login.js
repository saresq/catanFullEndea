import * as CONST from "./const.js"
import { t } from "./i18n.js"
import AudioManager from "./audio_manager.js"
import AccessibilityUI from "./ui/accessibility_ui.js"
const $ = document.querySelector.bind(document)

class LoginUI {
  $el = $('#login')
  $container = $('#login .container')
  audio_manager; accessibility_ui

  constructor() {
    this.audio_manager = new AudioManager()
    this.accessibility_ui = new AccessibilityUI({
      toggleBgm: allow => this.audio_manager.toggleBgm(allow),
      icons: { zoom: false, notifcation_sounds: false, shorcuts: false, quit: false },
    })
    localStorage.setItem(CONST.STORAGE_KEYS.STATUS_HISTORY, '[]')
  }

  render() {
    const params = new URLSearchParams(window.location.search)
    const isFull = params.get('full') === '1'
    const preGameId = (params.get('game_id') || '').toLowerCase()
    const preName = params.get('name') || ''
    const notice = params.get('notice') || ''

    const name = preName || localStorage.getItem(CONST.STORAGE_KEYS.PLAYER_NAME) || ''
    const joinSectionContent = isFull ? `
      <div class="full-game-section">
        <div class="notice">${t('login.full_notice')}</div>
        <div class="actions">
          <button class="btn btn--secondary back">${t('login.go_back')}</button>
          <button class="btn btn--primary spectate">${t('login.spectate')}</button>
        </div>
      </div>
    ` : `
      <input type="text" class="field name" name="name" placeholder="${t('login.your_name')}"/>
      <input type="text" class="field game-key" name="game_id" placeholder="${t('login.game_key')}"/>
      <button class="btn btn--primary join">${t('login.join_game')}</button>
    `

    this.accessibility_ui.render()
    this.$container.innerHTML = `
      <div class="action-types">
        <label><span>${t('login.host')}</span><input type="radio" name="action_type" value="host" ${isFull ? '' : 'checked="checked"'}/></label>
        <label><span>${t('login.join')}</span><input type="radio" name="action_type" value="join" ${(isFull || preGameId) ? 'checked="checked"' : ''}/></label>
      </div>
      <div class="action-container">
        <div class="notice" role="status"></div>
        <div class="section host-section">
          <input type="text" class="field name" name="name" placeholder="${t('login.your_name')}"/>
          <div class="content-wrapper">
            <div class="section-group">
              <label class="section-label" for="player-count">${t('login.players')}</label>
              <select id="player-count" class="field player-count">
                ${CONST.PLAYER_COUNTS.map(n => `<option value="${n}" ${n === CONST.PLAYER_COUNTS[0] ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </div>
            <div class="section-group">
              <label class="section-label" for="map-size">${t('login.map_size')}</label>
              <select id="map-size" class="field map-size">
                ${CONST.MAP_LIST.map((m, i) => `<option value="${m.id}" ${i === 0 ? 'selected' : ''}>${t('names.maps.' + m.id)}</option>`).join('')}
              </select>
            </div>
            <div class="section-group">
              <label class="section-label" for="win-points">${t('login.victory_points')}</label>
              <select id="win-points" class="field win-points">
                ${CONST.WIN_POINT_OPTIONS.map(v => `<option value="${v}" ${v === CONST.GAME_CONFIG.win_points ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </div>
            <div class="section-group">
              <label class="section-label" for="dice-mode">${t('login.dice_mode')}</label>
              <select id="dice-mode" class="field dice-mode">
                <option value="random" selected>${t('names.dice_modes.random')}</option>
                <option value="balanced">${t('names.dice_modes.balanced')}</option>
              </select>
            </div>
            <button class="btn btn--primary host">${t('login.start_game')}</button>
          </div>
          <div class="map-editor-link">
            <button class="btn btn--secondary map-editor">${t('login.map_editor')}</button>
          </div>
        </div>
        <div class="section join-section">
          ${joinSectionContent}
        </div>
      </div>
    `
    // Query values go in as text, never as markup
    this.$container.querySelectorAll('input.name').forEach($_ => $_.value = name)
    const $key = this.$container.querySelector('input.game-key')
    if ($key) { $key.value = preGameId }
    const $notice = this.$container.querySelector('.action-container > .notice')
    $notice.textContent = notice
    $notice.hidden = !notice

    // Focus name input if empty to prompt selection
    if (!isFull) {
      const nameInput = this.$container.querySelector('.join-section input.name')
      if (nameInput && !(nameInput.value || '').trim()) {
        // focus so the user picks a name immediately
        setTimeout(() => nameInput.focus(), 0)
      }
    }
    this.#setupEvents(isFull, preGameId)
    window.config = CONST.GAME_CONFIG
  }

  #setupEvents(isFull, preGameId) {
    // Setup name input enter key handler
    this.$container.querySelector('.host-section input').addEventListener('keydown', e => {
      if (e.code === 'Enter') {
        const btn = this.$container.querySelector('.host-section .host')
        btn && btn.click()
      }
    })

    // Enforce valid map size options based on the selected player count
    const pcSelect = this.$container.querySelector('.host-section select.player-count')
    const msSelect = this.$container.querySelector('.host-section select.map-size')
    const enforceMapSizeOptions = () => {
      const pc = +(pcSelect?.value || 3)
      if (!msSelect) return
      // Hide presets that cannot seat the chosen player count
      let first_allowed = 0
      Array.from(msSelect.options).forEach((opt, idx) => {
        const fits = CONST.mapFitsPlayers(CONST.MAPS[opt.value]?.mapkey, pc)
        opt.disabled = opt.hidden = !fits
        if (fits && !first_allowed) { first_allowed = idx }
      })
      if (msSelect.options[msSelect.selectedIndex]?.disabled) { msSelect.selectedIndex = first_allowed }
    }
    pcSelect?.addEventListener('change', enforceMapSizeOptions)
    // Initialize constraints on first render
    enforceMapSizeOptions()
    
    // Setup host submit button
    this.$container.querySelector('.host-section .host').addEventListener('click', e => {
      const host_name = this.$container.querySelector('.host-section input.name').value
      const player_count = +(this.$container.querySelector('.host-section select.player-count')?.value || 3)
      const map_id = this.$container.querySelector('.host-section select.map-size')?.value || 'standard'
      const win_points = +(this.$container.querySelector('.host-section select.win-points')?.value || 10)
      const mapkey = (CONST.MAPS[map_id] || CONST.MAPS.standard).mapkey

      const dice_mode = this.$container.querySelector('.host-section select.dice-mode')?.value || 'random'
      const config = { win_points, mapkey, dice_mode }
      const configParam = encodeURIComponent(JSON.stringify(config))
      window.location.href = `/game/new?name=${encodeURIComponent(host_name)}&players=${encodeURIComponent(player_count)}&config=${configParam}`
    })

    if (isFull) {
      this.$container.querySelector('.join-section .btn.back').addEventListener('click', () => {
        window.location.href = '/login'
      })
      this.$container.querySelector('.join-section .btn.spectate').addEventListener('click', () => {
        window.location.href = `/login?game_id=${preGameId}&spectate=1`
      })
    } else {
      // Setup join section input enter key handlers
      this.$container.querySelectorAll('.join-section input').forEach($_ => $_.addEventListener('keydown', e => {
        if (e.code === 'Enter') {
          const btn = this.$container.querySelector('.join-section .join')
          btn && btn.click()
        }
      }))
      
      // Setup join submit button
      this.$container.querySelector('.join-section .join').addEventListener('click', e => {
        const name = (this.$container.querySelector('.join-section input.name').value || '').trim()
        const game_key = (this.$container.querySelector('.join-section input.game-key').value || '').trim().toLowerCase()
        if (!name) {
          const nameInput = this.$container.querySelector('.join-section input.name')
          nameInput && nameInput.focus()
          return
        }
        window.location.href = `/login?name=${encodeURIComponent(name)}&game_id=${encodeURIComponent(game_key)}`
      })

      // Setup game key input special handling
      this.$container.querySelector('.join-section input.game-key').addEventListener('keydown', e => {
        if (e.code === 'Space') {
          e.target.value += '-'
          e.preventDefault()
        }
      })
    }

    // Setup name storage
    this.$container.querySelectorAll('.name').forEach($_ => $_.addEventListener('input', e => {
      try { localStorage.setItem(CONST.STORAGE_KEYS.PLAYER_NAME, e.target.value) } catch (e) {}
    }))
    
    // Setup map editor button
    this.$container.querySelector('.map-editor').addEventListener('click', e => {
      window.location.href = '/map-editor'
    })
  }
}

;(new LoginUI()).render()
