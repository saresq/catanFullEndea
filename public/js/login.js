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
            <div class="left-column">
              <div id="players-count-title" class="section-title">Select how many players:</div>
              <div class="button-group players-selection" role="radiogroup" aria-labelledby="players-count-title">
                ${[...Array(7).keys()].map(i => `
                  <button class="btn btn-selection player-count-${i + 2}" 
                    data-value="${i + 2}" 
                    ${i === 1 ? 'data-selected="true" aria-selected="true"' : 'aria-selected="false"'}
                    role="radio"
                    aria-label="${i + 2} players">
                    ${i + 2}
                  </button>`).join('')}
              </div>
            </div>
            <div class="right-column">
              <button class="btn btn-primary host">Start Game</button>
              <div class="section-panel">
                <div class="section-title">City Colors</div>
                <div class="city-colors-display">
                  ${[...Array(8).keys()].map(i => `<div class="city-color city-${i + 1}"></div>`).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="section join-section">
          <input type="text" class="name" name="name" placeholder="Your Name" value="${name}"/>
          <input type="text" class="game-key" name="game_id" placeholder="Game Key"/>
          <button class="btn btn-primary join">Join Game</button>
        </div>
      </div>
    `
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
    // Setup player selection buttons
    const playerButtons = this.$container.querySelectorAll('.players-selection .btn-selection');
    
    // Function to select a button
    const selectButton = (btn) => {
      // Remove selected state from all buttons
      playerButtons.forEach(b => {
        b.removeAttribute('data-selected')
        b.setAttribute('aria-selected', 'false')
      })
      // Set selected state on clicked button
      btn.setAttribute('data-selected', 'true')
      btn.setAttribute('aria-selected', 'true')
      
      // Log for testing
      console.log(`Selected player count: ${btn.getAttribute('data-value')}`)
    };
    
    // Add click event listeners
    playerButtons.forEach((btn, index) => {
      // Click event
      btn.addEventListener('click', e => {
        selectButton(btn);
      });
      
      // Keyboard navigation
      btn.addEventListener('keydown', e => {
        let nextIndex;
        
        switch(e.key) {
          case 'ArrowRight':
            nextIndex = (index + 1) % playerButtons.length;
            playerButtons[nextIndex].focus();
            e.preventDefault();
            break;
          case 'ArrowLeft':
            nextIndex = (index - 1 + playerButtons.length) % playerButtons.length;
            playerButtons[nextIndex].focus();
            e.preventDefault();
            break;
          case 'ArrowDown':
            if (index + 2 < playerButtons.length) {
              playerButtons[index + 2].focus();
              e.preventDefault();
            }
            break;
          case 'ArrowUp':
            if (index - 2 >= 0) {
              playerButtons[index - 2].focus();
              e.preventDefault();
            }
            break;
          case ' ':
          case 'Enter':
            selectButton(btn);
            e.preventDefault();
            break;
        }
      });
    })
    
    // Setup name input enter key handler
    this.$container.querySelector('.host-section input').addEventListener('keydown', e => {
      e.code === 'Enter' && this.$container.querySelector('.host-section .btn-primary').click()
    })
    
    // Setup host submit button
    this.$container.querySelector('.host-section .btn-primary').addEventListener('click', e => {
      const host_name = this.$container.querySelector('.host-section input.name').value
      const selectedButton = this.$container.querySelector('.players-selection .btn-selection[data-selected="true"]')
      const player_count = selectedButton ? +selectedButton.getAttribute('data-value') : 3
      window.location.href = `/game/new?name=${encodeURIComponent(host_name)}&players=${encodeURIComponent(player_count)}`
    })

    // Setup join section input enter key handlers
    this.$container.querySelectorAll('.join-section input').forEach($_ => $_.addEventListener('keydown', e => {
      e.code === 'Enter' && this.$container.querySelector('.join-section .btn-primary').click()
    }))
    
    // Setup join submit button
    this.$container.querySelector('.join-section .btn-primary').addEventListener('click', e => {
      const name = this.$container.querySelector('.join-section input.name').value
      const game_key = this.$container.querySelector('.join-section input.game-key').value
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
  }
}

;(new LoginUI()).render()
