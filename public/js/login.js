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
    const params = new URLSearchParams(window.location.search)
    const isFull = params.get('full') === '1'
    const preGameId = (params.get('game_id') || '').toLowerCase()
    const preName = params.get('name') || ''

    const name = preName || localStorage.getItem('player-name') || ''
    const joinSectionContent = isFull ? `
      <div class="full-game-section">
        <div class="notice">The game you are trying to join is currently full</div>
        <div class="actions">
          <button class="btn btn-secondary back">Go Back</button>
          <button class="btn btn-primary spectate">Spectate</button>
        </div>
      </div>
    ` : `
      <input type="text" class="name" name="name" placeholder="Your Name" value="${name}"/>
      <input type="text" class="game-key" name="game_id" placeholder="Game Key" value="${preGameId}"/>
      <button class="btn btn-primary join">Join Game</button>
    `

    this.accessibility_ui.render()
    this.$container.innerHTML = `
      <div class="action-types">
        <label><span>Host</span><input type="radio" name="action_type" value="host" ${isFull ? '' : 'checked="checked"'}/></label>
        <label><span>Join</span><input type="radio" name="action_type" value="join" ${(isFull || preGameId) ? 'checked="checked"' : ''}/></label>
      </div>
      <div class="action-container">
        <div class="section host-section">
          <input type="text" class="name" name="name" placeholder="Your Name" value="${name}"/>
          <div class="content-wrapper">
            <div class="section-group">
              <label class="section-label" for="player-count">Players:</label>
              <select id="player-count" class="select player-count">
                ${[...Array(9).keys()].map(i => `<option value="${i + 2}" ${i + 2 === 2 ? 'selected' : ''}>${i + 2}</option>`).join('')}
              </select>
            </div>
            <div class="section-group">
              <label class="section-label" for="map-size">Map Size:</label>
              <select id="map-size" class="select map-size">
                <option value="small" selected>Standard</option>
                <option value="medium">Extended</option>
                <option value="large">Large</option>
                <option value="extra-large">Extra Large</option>
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
          ${joinSectionContent}
        </div>
      </div>
    `

    // Focus name input if empty to prompt selection
    if (!isFull) {
      const nameInput = this.$container.querySelector('.join-section input.name')
      if (nameInput && !(nameInput.value || '').trim()) {
        // focus so the user picks a name immediately
        setTimeout(() => nameInput.focus(), 0)
      }
    }
    this.#setupEvents(isFull, preGameId)
    setTimeout(_ => $('.notice')?.classList.add('hide'), 5000)
    // console.log('%c🛠 Advanced Game Configurations 🪚', 'border-radius: 100px; padding: 10px 25px; font: 2em EagleLake, fantasy, cursive; background: #e8d49c; color: #9c5e15;')
    // console.log('%c→ Edit %cwindow.config', 'font-size: 1.2em', 'font-size: 1.2em; background: #eee; color: #333; padding: 2px 5px')
    // console.log(CONST.GAME_CONFIG)
    window.config = CONST.GAME_CONFIG
    // console.log('%c→ Send it as a query param to "/game/new" (everything is optional including name)', 'font-size: 1.2em')
    // console.log(`%cExample: %cwindow.location.href = '/game/new?name=Mr.Robot&config=' +
    //   encodeURIComponent(JSON.stringify(Object.assign(window.config, {
    //     player_count: 2, win_points: 5, map_shuffle: false,
    //     mapkey: \`S.S(bl_O2).S(br_O2).S-S.M8.D.M8.S-S.G9.S.S.G9.S-S.F10.S.S.S.F10.S-S.S.C11.S.S.C12.S.S-S.S.S.C2.S.C3.S.S.S-S(r_L2).J6.J5.J4.S.S.J4.J5.J6.S(l_L2)+S.S.S.S.S.S.S.S.S\`,
    //   })))`, 'font-size: 1em', 'font-size: 1em; background: #eee; color: #333; padding: 2px 5px')
    // console.log('%c→ Have Fun Playing Around. Come say Hi here https://github.com/bigomega/catan when you break things badly!\nThe README.md has the rules for writing your own mapkeys.\n%cCheers%c🍻', 'font-size: 1.2em', 'font-size: 3em', 'font-size: 6em')
  }

  #setupEvents(isFull, preGameId) {
    // Setup name input enter key handler
    this.$container.querySelector('.host-section input').addEventListener('keydown', e => {
      if (e.code === 'Enter') {
        const btn = this.$container.querySelector('.host-section .btn-primary')
        btn && btn.click()
      }
    })

    // Enforce valid map size options based on the selected player count
    const pcSelect = this.$container.querySelector('.host-section select.player-count')
    const msSelect = this.$container.querySelector('.host-section select.map-size')
    const enforceMapSizeOptions = () => {
      const pc = +(pcSelect?.value || 3)
      if (!msSelect) return
      const options = Array.from(msSelect.options)
      // minIdx: 0:Standard, 1:Extended, 2:Large, 3:ExtraLarge, 4:Argentum
      const minIdx = pc >= 9 ? 3 : (pc >= 7 ? 2 : (pc >= 5 ? 1 : 0))
      options.forEach((opt, idx) => {
        const isSmaller = idx < minIdx
        opt.disabled = isSmaller; opt.hidden = isSmaller
      })
      if (msSelect.selectedIndex < minIdx) { msSelect.selectedIndex = minIdx }
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
      else if (map_size === 'extra-large') mapkey = CONST.DEFAULT_MAPKEY_9_10
      else if (map_size === 'argentum') mapkey = CONST.ARGENTUM_MAPKEY

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
          const btn = this.$container.querySelector('.join-section .btn-primary')
          btn && btn.click()
        }
      }))
      
      // Setup join submit button
      this.$container.querySelector('.join-section .btn-primary').addEventListener('click', e => {
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
      try { localStorage.setItem('player-name', e.target.value) } catch (e) {}
    }))
    
    // Setup map editor button
    this.$container.querySelector('.map-editor').addEventListener('click', e => {
      window.location.href = '/map-editor'
    })
  }
}

;(new LoginUI()).render()
