import { STORAGE_KEYS as KEYS } from "../const.js"
const _dummyFn = _ => _
export default class AccessibilityUI {
  #shown_icons
  #spectator_link; #quit_label; #quit_armed = false; #back
  muted = true
  // muted = !!+localStorage.getItem('mute')
  muted_notif = (localStorage.getItem(KEYS.MUTE_NOTIFICATIONS) === null)
    ? true
    : !!+localStorage.getItem(KEYS.MUTE_NOTIFICATIONS)
  #toggleBoardZoom; #recenterMap; #toggleBgm; #toggleNotificationsAudio
  $el = document.querySelector('#game .accessibility-zone')

  keyboard_shortcuts = [
    [
      ['Roll Dice', 'SPACE'],
      ['Build Road', 'r'],
      ['Build Settlement', 's'],
      ['Build City', 'c'],
      ['Buy Development Card', 'd'],
      ['Trade options', 't'],
      ['Play Knight Card', 'k'],
      ['End Turn ⏭️', 'e (or) SPACE'],
    ], [
      ['Full Screen', 'f'],
      ['Board Zoom In', '='],
      ['Board Zoom Out', '-'],
      ['Recenter Map', 'Home'],
      ['Toggle Background Music', 'm'],
      ['Toggle Notification Sounds', 'n'],
      ['Show Status History', 'h'],
      ['Show this section', '?'],
      ['Toggle players panel', 'Shift'],
      ['Cancel action / Close stuff', 'Esc'],
    ]
  ]

  constructor({ toggleBoardZoom = _dummyFn, recenterMap = null, toggleBgm = _dummyFn, toggleNotificationsAudio = _dummyFn,
    spectator_link = false, quit_label = 'Quit game',
    /** `{ label, href }`: a last row that leaves without the quit arming, for pages with no game to lose. */
    back = null,
    icons: { fullscreen = true, zoom = true, bgm = true, notifcation_sounds = true,
      shorcuts = true, info = true, quit = true } = {}} = {}) {
    this.#shown_icons = {
      // iPhone Safari has no Element#requestFullscreen: no item, and `f` does nothing.
      fullscreen: fullscreen && !!document.documentElement.requestFullscreen,
      zoom, bgm, notifcation_sounds, shorcuts, info, quit,
    }
    this.#spectator_link = spectator_link
    this.#quit_label = quit_label
    this.#back = back
    this.#toggleBoardZoom = toggleBoardZoom
    this.#recenterMap = recenterMap
    this.#toggleBgm = toggleBgm
    this.#toggleNotificationsAudio = toggleNotificationsAudio
  }

  render() {
    const shown = this.#shown_icons
    /** One menu row. `toggle` adds the on/off text and `aria-pressed`, both filled by #syncStates. */
    const item = (cls, ico, label, key = '', toggle = false) => `
      <button class="item ${cls}"${toggle ? ' aria-pressed="false"' : ''}>
        <span class="ico">${ico}</span><span class="label">${label}</span>
        ${toggle ? '<span class="state"></span>' : ''}<span class="key">${key}</span>
      </button>`

    this.$el.innerHTML = `
      <button class="icon settings-gear" title="Options" aria-label="Options"
        aria-expanded="false" aria-controls="options-menu"></button>
      ${this.#recenterMap ? `<button class="icon recenter" title="Recenter Map (Home)" aria-label="Recenter map">🏠</button>` : ''}
      <div class="menu-backdrop hide"></div>
      <div class="options-menu hide" id="options-menu">
        ${shown.fullscreen ? item('full-screen', '⇱', 'Full screen', 'f', true) : ''}
        ${shown.zoom ? item('zoom-in', '✚', 'Zoom in', '=') + item('zoom-out', '−', 'Zoom out', '-') : ''}
        ${shown.notifcation_sounds ? item('notifications', '🔊', 'Notification sounds', 'n', true) : ''}
        ${shown.bgm ? item('bgm', '♫', 'Music', 'm', true) : ''}
        ${shown.shorcuts ? item('question-mark', '?', 'Keyboard shortcuts', '?') : ''}
        ${this.#spectator_link ? item('spectator-link', '🔗', 'Copy spectator link') : ''}
        ${shown.info ? item('info', 'ℹ︎', 'About') : ''}
        ${shown.quit ? `<div class="sep"></div>` + item('quit danger', '⏻', this.#quit_label) : ''}
        ${this.#back ? `<div class="sep"></div>` + item('back', '←', this.#back.label) : ''}
      </div>
      ${shown.shorcuts ? `
        <div class="keyboard-shortcuts panel hide">${this.keyboard_shortcuts.map(group =>
          `<div class="shortcuts-container">${group.map(([title, shortcut]) =>
            `<div class="shortcut">
              <div class="title">${title}</div>
              <div class="key">${shortcut}</div>
            </div>`).join('')}
          </div>`).join('')}
          <button class="close">X</button>
        </div>
      `: ''}
      ${shown.info ? `
        <div class="info-zone panel hide">
          <div class="container">
            <div class="text-container">
              <div class="title">
                Catan Full Endea
                <br>
                <small>
                  Based on <a href="https://github.com/bigomega/catan" target="_blank">BigOmega's Catan</a>
                </small>
              </div>
              <p>
                Full endea development by Saresq
                <br>
                <br>
                <a class="rules" href="https://www.catan.com/sites/default/files/2021-06/catan_base_rules_2020_200707.pdf" target="_blank">Game Rules</a>
              </p>
            </div>
          </div>
          <button class="close">X</button>
        </div>
      ` : ''}
    `
    this.#setupEvents()
    this.#syncStates()
  }

  /** Open or close the menu. `refocus` sends focus back to the gear, for the keyboard paths. */
  #showMenu(show, refocus) {
    const $gear = this.$el.querySelector('.settings-gear')
    const $menu = this.$el.querySelector('.options-menu')
    $menu.classList.toggle('hide', !show)
    this.$el.querySelector('.menu-backdrop').classList.toggle('hide', !show)
    $gear.setAttribute('aria-expanded', show)
    this.#disarmQuit()
    if (show) $menu.querySelector('.item')?.focus()
    else if (refocus) $gear.focus()
  }

  #menuOpen() { return !this.$el.querySelector('.options-menu')?.classList.contains('hide') }

  /** On/off text and `aria-pressed` for every toggle row, from the state the class already holds. */
  #syncStates() {
    const set = (sel, on, ico) => {
      const $item = this.$el.querySelector(sel)
      if (!$item) return
      $item.setAttribute('aria-pressed', on)
      $item.querySelector('.state').textContent = on ? 'on' : 'off'
      if (ico) $item.querySelector('.ico').textContent = ico
    }
    const full = !!document.fullscreenElement
    set('.item.full-screen', full, full ? '⇲' : '⇱')
    set('.item.notifications', !this.muted_notif, this.muted_notif ? '🔇' : '🔊')
    set('.item.bgm', !this.muted)
  }

  #disarmQuit() {
    if (!this.#quit_armed) return
    this.#quit_armed = false
    const $quit = this.$el.querySelector('.item.quit')
    $quit.classList.remove('armed')
    $quit.querySelector('.label').textContent = this.#quit_label
  }

  /** First activation arms the row, second one leaves. Anything else disarms it. */
  #onQuit() {
    if (this.#quit_armed) { window.location.href = '/logout'; return }
    this.#quit_armed = true
    const $quit = this.$el.querySelector('.item.quit')
    $quit.classList.add('armed')
    $quit.querySelector('.label').textContent = `${this.#quit_label}? Tap again`
  }

  #copySpectatorLink($item) {
    const url = `${location.origin}/login?game_id=${window.game_obj?.id}&spectate=1`
    // No clipboard on plain HTTP: show the URL, selected, so it can be copied by hand.
    const fallback = () => {
      const $input = document.createElement('input')
      $input.className = 'item link'
      $input.readOnly = true
      $input.value = url
      $item.replaceWith($input)
      $input.select()
    }
    const copying = navigator.clipboard?.writeText(url)
    if (!copying) return fallback()
    copying.then(() => {
      const $label = $item.querySelector('.label')
      $label.textContent = 'Link copied'
      setTimeout(() => {
        $label.textContent = 'Copy spectator link'
        this.#showMenu(false)
      }, 1500)
    }).catch(fallback)
  }

  #setupEvents() {
    const $menu = this.$el.querySelector('.options-menu')
    this.$el.querySelector('.settings-gear')?.addEventListener('click', e => this.#showMenu(!this.#menuOpen()))
    this.$el.querySelector('.menu-backdrop')?.addEventListener('click', e => this.#showMenu(false))
    this.$el.querySelector('.recenter')?.addEventListener('click', e => this.#recenterMap())
    // Any row but Quit takes the arming away.
    $menu.addEventListener('click', e => { e.target.closest('.item.quit') || this.#disarmQuit() })

    // Toggles keep the menu open and update in place; everything else closes it.
    this.$el.querySelector('.item.full-screen')?.addEventListener('click', e => this.toggleFullScreen())
    this.$el.querySelector('.item.notifications')?.addEventListener('click', e => this.toggleMuteNotications())
    this.$el.querySelector('.item.bgm')?.addEventListener('click', e => this.toggleMuteBgm())
    this.$el.querySelector('.item.zoom-in')?.addEventListener('click', e => this.toggleZoom())
    this.$el.querySelector('.item.zoom-out')?.addEventListener('click', e => this.toggleZoom(true))
    this.$el.querySelector('.item.question-mark')?.addEventListener('click', e => {
      this.#showMenu(false, true)
      this.showHideKeyboardShortcuts(true)
    })
    this.$el.querySelector('.item.info')?.addEventListener('click', e => {
      this.#showMenu(false, true)
      this.showHideInfo(true)
    })
    this.$el.querySelector('.item.spectator-link')?.addEventListener('click', e => this.#copySpectatorLink(e.currentTarget))
    this.$el.querySelector('.item.quit')?.addEventListener('click', e => this.#onQuit())
    this.$el.querySelector('.item.back')?.addEventListener('click', e => { window.location.href = this.#back.href })
    this.$el.querySelector('.keyboard-shortcuts .close')?.addEventListener('click', e => this.showHideKeyboardShortcuts(false))
    this.$el.querySelector('.info-zone .close')?.addEventListener('click', e => this.showHideInfo(false))

    document.addEventListener('fullscreenchange', e => this.#syncStates())

    // Close info displays when clicked outside. The menu has the backdrop for that.
    document.addEventListener('click', e => {
      const keyboardShortcuts = this.$el.querySelector('.keyboard-shortcuts')
      const infoZone = this.$el.querySelector('.info-zone')

      if (keyboardShortcuts && !keyboardShortcuts.classList.contains('hide')) {
        if (!keyboardShortcuts.contains(e.target) && !this.$el.querySelector('.item.question-mark')?.contains(e.target)) {
          this.showHideKeyboardShortcuts(false)
        }
      }

      if (infoZone && !infoZone.classList.contains('hide')) {
        if (!infoZone.contains(e.target) && !this.$el.querySelector('.item.info')?.contains(e.target)) {
          this.showHideInfo(false)
        }
      }
    })

    document.addEventListener('keydown', e => {
      switch (e.code) {
        case 'KeyF': this.toggleFullScreen(); break
        case 'Equal': this.toggleZoom(); break
        case 'Minus': this.toggleZoom(true); break
        case 'Home': this.#recenterMap?.(); break
        case 'KeyN': this.toggleMuteNotications(); break
        case 'KeyM': this.toggleMuteBgm(); break
        case 'Escape':
          this.#menuOpen() && this.#showMenu(false, true)
          this.showHideKeyboardShortcuts(false)
          this.showHideInfo(false)
          break
      }
      e.key === '?' && this.showHideKeyboardShortcuts(true)
    })
  }

  toggleFullScreen() {
    if (!this.#shown_icons.fullscreen) return
    if (document.querySelector('input[type="text"]:focus')) return
    // `fullscreenchange` drives the row, so the browser's own Esc exit stays truthful too.
    document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.()
  }

  toggleMuteBgm() {
    if (!this.#shown_icons.bgm) return
    if (document.querySelector('input[type="text"]:focus')) return
    this.muted = !this.muted
    // localStorage.setItem('mute', +this.muted)
    this.#toggleBgm(!this.muted)
    this.#syncStates()
  }

  toggleMuteNotications() {
    if (!this.#shown_icons.notifcation_sounds) return
    this.muted_notif = !this.muted_notif
    try { localStorage.setItem(KEYS.MUTE_NOTIFICATIONS, +this.muted_notif) } catch (e) {}
    this.#toggleNotificationsAudio(!this.muted_notif)
    this.#syncStates()
  }

  /** `zoom` only decides whether the rows render: `=` and `-` keep working without them. */
  toggleZoom(out) {
    if (document.querySelector('textarea:focus')) return
    this.#toggleBoardZoom(out)
  }

  showHideKeyboardShortcuts(show) {
    this.#shown_icons.shorcuts
      && this.$el.querySelector('.keyboard-shortcuts').classList[show ? 'remove' : 'add']('hide')
  }

  showHideInfo(show) {
    if (!this.#shown_icons.info) return
    if (document.querySelector('input[type="text"]:focus')) return
    this.#shown_icons.info
      && this.$el.querySelector('.info-zone').classList[show ? 'remove' : 'add']('hide')
  }
}
