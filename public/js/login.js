import * as CONST from "./const.js"
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
    localStorage.setItem('status_history', '[]')
  }

  render() {
    const name = localStorage.getItem('player-name') || ''
    this.accessibility_ui.render()
    this.$container.innerHTML = `
      <div class="action-types">
        <label><span>Host</span><input type="radio" name="action_type" value="host" checked="checked"/></label>
        <label><span>Join</span><input type="radio" name="action_type" value="join"/></label>
      </div>
      <div class="action-container">
        <div class="section host-section">
          <input type="text" class="name" name="name" placeholder="Your Name" value="${name}"/>
          <div class="content-wrapper">
            <div class="section-group">
              <label class="section-label" for="player-count">Players:</label>
              <select id="player-count" class="select player-count">
                ${[...Array(7).keys()].map(i => `<option value="${i + 2}" ${i + 2 === 3 ? 'selected' : ''}>${i + 2}</option>`).join('')}
              </select>
            </div>
            <div class="section-group">
              <label class="section-label" for="map-size">Map Size:</label>
              <select id="map-size" class="select map-size">
                <option value="small" selected>Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="argentum">Argentum</option>
              </select>
            </div>
            <div class="section-group">
              <label class="section-label" for="win-points">Victory Points:</label>
              <select id="win-points" class="select win-points">
                ${Array.from({ length: 16 }, (_, i) => i + 5).map(v => `<option value="${v}" ${v === 10 ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </div>
            <div class="section-group">
              <label class="section-label" for="dice-mode">Dice Mode:</label>
              <select id="dice-mode" class="select dice-mode">
                <option value="random" selected>Random</option>
                <option value="balanced">Balanced</option>
              </select>
            </div>
            <button class="btn btn-primary host">Start Game</button>
          </div>
          <div class="map-editor-link">
            <button class="btn btn-secondary map-editor">Go to Map Editor</button>
          </div>
        </div>
        <div class="section join-section">
          <input type="text" class="name" name="name" placeholder="Your Name" value="${name}"/>
          <input type="text" class="game-key" name="game_id" placeholder="Game Key"/>
          <button class="btn btn-primary join">Join Game</button>
        </div>
      </div>
    `
    // If a game_id is present in the URL, prefill and switch to Join tab
    const params = new URLSearchParams(window.location.search)
    const preGameId = params.get('game_id')
    const preName = params.get('name')
    if (preGameId) {
      const joinRadio = this.$container.querySelector('input[type="radio"][value="join"]')
      const hostRadio = this.$container.querySelector('input[type="radio"][value="host"]')
      joinRadio && (joinRadio.checked = true)
      hostRadio && (hostRadio.checked = false)
      const gameKeyInput = this.$container.querySelector('.join-section input.game-key')
      if (gameKeyInput) gameKeyInput.value = preGameId
      // Prefill name if present in URL, otherwise focus the name input to prompt selection
      const nameInput = this.$container.querySelector('.join-section input.name')
      if (nameInput) {
        if (preName && preName.trim()) {
          nameInput.value = preName
        } else if (!(nameInput.value || '').trim()) {
          // focus so the user picks a name immediately
          setTimeout(() => nameInput.focus(), 0)
        }
      }
    }
    this.#setupEvents()
    setTimeout(_ => $('.notice')?.classList.add('hide'), 5000)
    console.log('%c🛠 Advanced Game Configurations 🪚', 'border-radius: 100px; padding: 10px 25px; font: 2em EagleLake, fantasy, cursive; background: #e8d49c; color: #9c5e15;')
    console.log('%c→ Edit %cwindow.config', 'font-size: 1.2em', 'font-size: 1.2em; background: #eee; color: #333; padding: 2px 5px')
    console.log(CONST.GAME_CONFIG)
    window.config = CONST.GAME_CONFIG
    console.log('%c→ Send it as a query param to "/game/new" (everything is optional including name)', 'font-size: 1.2em')
    console.log(`%cExample: %cwindow.location.href = '/game/new?name=Mr.Robot&config=' +
      encodeURIComponent(JSON.stringify(Object.assign(window.config, {
        player_count: 2, win_points: 5, map_shuffle: false,
        mapkey: \`S.S(bl_O2).S(br_O2).S-S.M8.D.M8.S-S.G9.S.S.G9.S-S.F10.S.S.S.F10.S-S.S.C11.S.S.C12.S.S-S.S.S.C2.S.C3.S.S.S-S(r_L2).J6.J5.J4.S.S.J4.J5.J6.S(l_L2)+S.S.S.S.S.S.S.S.S\`,
      })))`, 'font-size: 1em', 'font-size: 1em; background: #eee; color: #333; padding: 2px 5px')
    console.log('%c→ Have Fun Playing Around. Come say Hi here https://github.com/bigomega/catan when you break things badly!\nThe README.md has the rules for writing your own mapkeys.\n%cCheers%c🍻', 'font-size: 1.2em', 'font-size: 3em', 'font-size: 6em')
  }

  #setupEvents() {
    // Setup name input enter key handler
    this.$container.querySelector('.host-section input').addEventListener('keydown', e => {
      e.code === 'Enter' && this.$container.querySelector('.host-section .btn-primary').click()
    })

    // Enforce valid map size options based on selected player count
    const pcSelect = this.$container.querySelector('.host-section select.player-count')
    const msSelect = this.$container.querySelector('.host-section select.map-size')
    const enforceMapSizeOptions = () => {
      const pc = +(pcSelect?.value || 3)
      // Enable all by default
      Array.from(msSelect.options).forEach(opt => { opt.disabled = false; opt.hidden = false })
      // Apply constraints: never smaller than required for the player count
      if (pc >= 7) {
        // Only Large is allowed
        Array.from(msSelect.options).forEach(opt => {
          if (opt.value !== 'large') { opt.disabled = true; opt.hidden = true }
        })
        msSelect.value = 'large'
      } else if (pc >= 5) {
        // Small is not allowed; Medium or Large are okay
        const smallOpt = Array.from(msSelect.options).find(o => o.value === 'small')
        if (smallOpt) { smallOpt.disabled = true; smallOpt.hidden = true }
        if (msSelect.value === 'small') { msSelect.value = 'medium' }
      } else {
        // 2–4 players: all sizes allowed
      }
    }
    pcSelect?.addEventListener('change', enforceMapSizeOptions)
    // Initialize constraints on first render
    enforceMapSizeOptions()
    
    // Setup host submit button
    this.$container.querySelector('.host-section .btn-primary').addEventListener('click', e => {
      const host_name = this.$container.querySelector('.host-section input.name').value
      const player_count = +(this.$container.querySelector('.host-section select.player-count')?.value || 3)
      const map_size = this.$container.querySelector('.host-section select.map-size')?.value || 'small'
      const win_points = +(this.$container.querySelector('.host-section select.win-points')?.value || 10)

      // Map size to mapkey
      let mapkey = CONST.DEFAULT_MAPKEY
      if (map_size === 'medium') mapkey = CONST.DEFAULT_MAPKEY_5_6
      else if (map_size === 'large') mapkey = CONST.DEFAULT_MAPKEY_7_8
      else if (map_size === 'argentum') mapkey = CONST.ARGENTUM_MAPKEY

      const dice_mode = this.$container.querySelector('.host-section select.dice-mode')?.value || 'random'
      const config = { win_points, mapkey, dice_mode }
      const configParam = encodeURIComponent(JSON.stringify(config))
      window.location.href = `/game/new?name=${encodeURIComponent(host_name)}&players=${encodeURIComponent(player_count)}&config=${configParam}`
    })

    // Setup join section input enter key handlers
    this.$container.querySelectorAll('.join-section input').forEach($_ => $_.addEventListener('keydown', e => {
      e.code === 'Enter' && this.$container.querySelector('.join-section .btn-primary').click()
    }))
    
    // Setup join submit button
    this.$container.querySelector('.join-section .btn-primary').addEventListener('click', e => {
      const name = (this.$container.querySelector('.join-section input.name').value || '').trim()
      const game_key = (this.$container.querySelector('.join-section input.game-key').value || '').trim()
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

    // Setup name storage
    this.$container.querySelectorAll('.name').forEach($_ => $_.addEventListener('input', e => {
      localStorage.setItem('player-name', e.target.value)
    }))
    
    // Setup map editor button
    this.$container.querySelector('.map-editor').addEventListener('click', e => {
      window.location.href = '/map-editor'
    })
  }
}

;(new LoginUI()).render()
