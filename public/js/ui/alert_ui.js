import { default as MSG, getName } from "../const_messages.js"
import { STORAGE_KEYS as KEYS, REMATCH_SECONDS, GAME_STATES as ST } from "../const.js"
const $ = document.querySelector.bind(document)
const TURN_SEP = '<<<TURN_SEPARATOR>>>'

export default class AlertUI {
  #player; #alert_time; #alert_timer;
  #onStatusUpdate; #showCard
  #status_history = []
  $status_history = $('#game .current-player .status-history-zone')
  $status_history_container = $('#game .current-player .status-history-zone > .container')
  $status_now = $('#game .current-player .status-history-zone > .now')
  $alert = $('#game > .alert')
  $status_bar = $('#game > .current-player .status-bar .status-text')

  constructor(player, alert_time = 3, { onStatusUpdate, showCard }){
    this.#player = player
    this.#onStatusUpdate = onStatusUpdate
    this.#showCard = showCard
    this.#alert_time = alert_time
    // Ensure status history doesn't persist across games (e.g., rematch)
    try {
      const gid = (window && window.game_obj && window.game_obj.id) ? ('' + window.game_obj.id) : null
      if (gid) {
        const prevGid = localStorage.getItem(KEYS.STATUS_HISTORY_GID)
        if (prevGid && prevGid !== gid) {
          localStorage.setItem(KEYS.STATUS_HISTORY, '[]')
        }
        localStorage.setItem(KEYS.STATUS_HISTORY_GID, gid)
      }
    } catch (e) {}
    try {
      this.#status_history = JSON.parse(localStorage.getItem(KEYS.STATUS_HISTORY))
      if (!(this.#status_history instanceof Array)) { this.#status_history = [] }
    } catch (e) {}
    // Setup builds land before the first roll, so nothing else would label them.
    if (!this.#status_history.length && window.game_obj?.state === ST.INITIAL_SETUP) {
      this.#status_history.unshift(TURN_SEP + 'Setup')
    }
  }

  render() {
    const pcClass = 'pc' + (this.#player.color_id || this.#player.id)
    this.$status_history.classList.add(pcClass)
    this.$alert.classList.add(pcClass)
    this.$status_bar.innerHTML = this.#player.last_status || '...'
    this.#mirror()
    // Stored newest first, but a turn's label has to sit above its entries: buffer until its
    // separator shows up. Entries with no separator left (an old save) come last, unlabelled.
    let html = '', buffer = ''
    this.#status_history.forEach(s => {
      if (!s.startsWith(TURN_SEP)) return void (buffer += `<div class="status">${s}</div>`)
      html += `<div class="turn-separator">${s.slice(TURN_SEP.length)}</div>` + buffer
      buffer = ''
    })
    this.$status_history_container.innerHTML = html + buffer
    this.$alert.querySelector('.close').addEventListener('click', e => this.closeBigAlert())
    this.$status_history.querySelector('.close').addEventListener('click', e => this.toggleStatusHistory(false))
    // The whole bar is the entry point; a link inside a status keeps its own click.
    $('#game > .current-player .status-bar').addEventListener('click', e => {
      e.target.closest('a') || this.toggleStatusHistory()
    })
    document.addEventListener('keydown', e => {
      e.code === 'Escape' && (this.closeBigAlert(), this.toggleStatusHistory(false))
      e.code === 'KeyH' && this.toggleStatusHistory()
    })
  }

  toggleStatusHistory(show = !this.$status_history.classList.contains('show')) {
    this.$status_history.classList[show ? 'add' : 'remove']('show')
    $('#game .history-toggle')?.setAttribute('aria-expanded', show)
  }

  /** The bar truncates, the sheet does not: it opens with the full current status on top. */
  #mirror() { this.$status_now && (this.$status_now.innerHTML = this.$status_bar.innerHTML) }

  /** A new entry belongs under the newest turn header, not above it. */
  #prependEntry(html) {
    const $entry = document.createElement('div')
    $entry.className = 'status'
    $entry.innerHTML = html
    const $first = this.$status_history_container.firstElementChild
    if ($first?.classList.contains('turn-separator')) $first.after($entry)
    else this.$status_history_container.prepend($entry)
  }

  showEndGameButton(onClick) {
    const $container = $('#game .status-history-icon-zone')
    if (!$container || $('#game .show-end-game')) return
    const $btn = document.createElement('button')
    $btn.className = 'icon show-end-game'
    $btn.title = 'Show End Game Screen'
    $btn.addEventListener('click', onClick)
    $container.prepend($btn)
  }

  /** Separators are stored as TURN_SEP + label (the turn's player). */
  addTurnSeparator(label = '') {
    // Same label as the newest separator: same turn (page reload re-emits the state), skip
    if (this.#status_history.find(s => s.startsWith(TURN_SEP)) === TURN_SEP + label) return
    this.#status_history.unshift(TURN_SEP + label)
    try { localStorage.setItem(KEYS.STATUS_HISTORY, JSON.stringify(this.#status_history)) } catch (e) {}
    const $sep = document.createElement('div')
    $sep.className = 'turn-separator'
    $sep.innerHTML = label
    this.$status_history_container.prepend($sep)
  }

  closeBigAlert() {
    clearTimeout(this.#alert_timer); this.$alert.classList.remove('show', 'animate')
  }

  bigAlert(message, no_status) {
    const $alert_text = this.$alert.querySelector('.text')
    this.$alert.classList.add('show')
    // Use message only in the text element
    $alert_text.innerHTML = message
    clearTimeout(this.#alert_timer)
    this.#alert_timer = setTimeout(_ => this.closeBigAlert(), this.#alert_time * 1000)
    no_status || this.setStatusBarOnly(message)
  }

  setStatus(message = '...') {
    const msg = message.replace(/<br\/?>/g, '. ')
    this.$status_bar.innerHTML = msg
    this.#mirror()
    this.#status_history.unshift(msg)
    localStorage.setItem(KEYS.STATUS_HISTORY, JSON.stringify(this.#status_history))
    this.#prependEntry(msg)
    this.#onStatusUpdate(msg)
  }

  setStatusBarOnly(message = '...') {
    const msg = message.replace(/<br\/?>/g, '. ')
    this.$status_bar.innerHTML = msg
    this.#mirror()
    this.#onStatusUpdate(msg)
  }

  appendStatus(message = '...') {
    const add = message.replace(/<br\/?>/g, '. ')
    this.$status_bar.innerHTML += add
    this.#mirror()
    const html = this.$status_bar.innerHTML
    // The newest entry is this turn's only while no separator sits above it. After a turn start
    // the append opens a new entry instead of growing the previous player's line.
    const $entry = this.#status_history[0]?.startsWith(TURN_SEP)
      ? null : this.$status_history_container.querySelector('.status')
    if ($entry) { this.#status_history[0] = html; $entry.innerHTML = html }
    else { this.#status_history.unshift(html); this.#prependEntry(html) }
    try { localStorage.setItem(KEYS.STATUS_HISTORY, JSON.stringify(this.#status_history)) } catch (e) {}
    this.#onStatusUpdate(html)
  }

  alertStrategy(t) { this.setStatusBarOnly(MSG.STRATEGIZE.all(t)) }

  alertInitialSetup(p, turn) {
    const msg = turn < 2 ? MSG.INITIAL_BUILD : MSG.INITIAL_BUILD_2
    if (this.#isMe(p)) this.setStatusBarOnly(msg.self())
    else this.setStatusBarOnly(msg.other(p))
  }
  alertRollTurn(p) {
    this.setStatusBarOnly(this.#isMe(p) ? MSG.ROLL_TURN.self() : MSG.ROLL_TURN.other(p))
  }
  alertTurnStart(p) { this.addTurnSeparator(getName(this.#isNotMe(p))) }
  alertDiceValue(p, d1, d2, rob_res) {
    this.setStatus(MSG.DICE_VALUE.all(d1, d2, this.#isNotMe(p), rob_res))
  }
  alertBuild(p, piece) { this.setStatus(MSG.BUILDING.all(piece, this.#isNotMe(p))) }
  alertResTaken(res) { this.appendStatus(MSG.RES_TAKEN.all(res)) }
  alertDevCardTaken(p, card) { this.setStatus(MSG.DEVELOPMENT_CARD_BUY.all(this.#isNotMe(p), card)) }
  alertRobberDrop(drop_count) {
    if (drop_count) this.bigAlert(MSG.ROBBER.self(drop_count))
    else this.appendStatus(MSG.ROBBER.other())
  }
  alertRobberDropDone() { this.setStatus(MSG.ROBBER.other()) }
  alertRobberMove(p) {
    if (this.#isMe(p)) this.bigAlert(MSG.ROBBER_MOVE.self())
    else this.setStatus(MSG.ROBBER_MOVE.other(p))
  }
  alertRobberMoveDone(p, tile, num) { this.setStatus(MSG.ROBBER_MOVED_TILE.all(tile, num, this.#isNotMe(p))) }
  alertStolenInfo(p, res) { this.appendStatus(MSG.PLAYER_STOLE_RES.all(this.#isNotMe(p), res)) }
  alertTradedInfo(p1, p2, given, taken) {
    this.setStatus(MSG.PLAYER_TRADE_INFO.all({
      p1: this.#isNotMe(p1), p2: this.#isNotMe(p2), board: !p2
    }, given, taken))
  }
  alertKnightUsed() { this.appendStatus(MSG.KNIGHT_USED_APPEND.all()) }
  alertRoadBuildingUsed(p) { this.setStatus(MSG.ROAD_BUILDING_USED.all(this.#isNotMe(p))) }
  alertMonopolyUsed(p, res, total, self) { this.setStatus(MSG.MONOPOLY_USED.all(this.#isNotMe(p), res, total, self)) }
  alertYearOfPlentyUsed(p, res_obj) { this.setStatus(MSG.YEAR_OF_PLENTY_USED.all(this.#isNotMe(p), res_obj)) }
  alertLargestArmy(p, count) { this.setStatus(MSG.LARGEST_ARMY.all(this.#isNotMe(p), count)) }
  alertLongestRoad(p, len) { this.setStatus(MSG.LONGEST_ROAD.all(this.#isNotMe(p), len)) }
  alertPlayerQuit(p, end) { this.bigAlert(MSG.PLAYER_QUIT.all(p, end)) }
  alertGameEnd(p, context, game) {
    this.setStatus(MSG.END_STATUS.all(this.#isNotMe(p), context.vps))
    this.renderEndGameAlert(this.#isNotMe(p), context, game)
  }

  renderEndGameAlert(p, { pid, color_id, S, C, dVp, largest_army, longest_road }, game) {
    // Show content in text element only
    const cid = p?.color_id || color_id || pid
    const content = `
      <div class="game-ended pc${cid}">
        <div class="title-emoji">🏆</div>
        <div class="player-name">🎖 ${getName(p)} Won 🎖</div>
        <small>
          ${S ? `<div class="pts S"><div class="pts-icon"></div><b>${S} VP</b> <span>${S} Settlement${S>1?'s':''}</span></div>` : ''}
          ${C ? `<div class="pts C"><div class="pts-icon"></div><b>${C * 2} VP</b> <span>${C} Cit${C>1?'ies':'y'}</span></div>` : ''}
          ${dVp ? `<div class="pts dVp" data-type="dVp"><div class="card card--xs" data-card="dVp"></div><b>${dVp} VP</b> <span>${dVp} Card${dVp>1?'s':''}</span></div>` : ''}
          ${largest_army ? `<div class="pts army" data-type="lArmy"><div class="pts-icon"></div><b>2 VP</b> <span>Largest Army (${largest_army})</span></div>` : ''}
          ${longest_road ? `<div class="pts road" data-type="lRoad"><div class="pts-icon"></div><b>2 VP</b> <span>Longest Road (${longest_road})</span></div>` : ''}
        </small>
        
        <!-- Tabs Section -->
        <div class="end-tabs">
          <div class="end-tabs-header">
            <div class="end-tab active" data-tab="overview">Overview</div>
            <div class="end-tab" data-tab="wip">Stats (WIP)</div>
          </div>
          <div class="end-tabs-content">
            <div class="end-tab-content" data-tab="overview"></div>
            <div class="end-tab-content hide" data-tab="wip" style="text-align:center;">More detailed stats coming soon...</div>
          </div>
        </div>

        <div class="rematch-section">
          <div class="rematch-vote-row">
            <button class="btn btn--primary vote-rematch">Vote Rematch</button>
            <div class="rematch-timer">⏳ <span class="time-left">${REMATCH_SECONDS}</span>s</div>
          </div>
          <div class="rematch-status"></div>
        </div>
      </div>
    `;
    this.$alert.querySelector('.text').innerHTML = content;
    this.$alert.classList.add('show')
    this.$alert.querySelectorAll('.dVp, .army, .road').forEach($_ => $_.addEventListener('click', e => {
      this.#showCard(e.target.dataset.type || e.target.parentElement.dataset.type)
    }))

    // Build Overview table
    try {
      const $overview = this.$alert.querySelector('.end-tab-content[data-tab="overview"]')
      if ($overview) {
        const g = game || window.game
        const myId = (window.player_obj && window.player_obj.id) || (p && p.id) || null
        const ids = []
        if (myId) ids.push(myId)
        if (g && Array.isArray(g.opponents)) {
          g.opponents.forEach(o => { if (o && o.id && !ids.includes(o.id)) ids.push(o.id) })
        }
        let players = ids.map(id => g && typeof g.getPlayer === 'function' ? g.getPlayer(id) : null).filter(Boolean)
        // Fallback: include provided winner context if list is empty
        if (!players.length && p) { players = [p] }

        const rows = players.map(pl => {
          const total_vps = (pl.public_vps || 0) + (pl.private_vps || 0)
          const settlements = (pl.pieces && pl.pieces.S && pl.pieces.S.length) || 0
          const cities = (pl.pieces && pl.pieces.C && pl.pieces.C.length) || 0
          const dev1vp = (pl.private_vps || 0) // 1VP dev cards count approximated by private VPs
          const knights = (pl.open_dev_cards && pl.open_dev_cards.dK) || 0
          const roads = (pl.pieces && pl.pieces.R && pl.pieces.R.length) || 0
          const color = (pl.color_id ?? pl.id)
          const name = pl.name || ('P' + pl.id)
          return { id: pl.id, name, color, total_vps, settlements, cities, dev1vp, knights, roads }
        }).sort((a, b) => b.total_vps - a.total_vps || a.name.localeCompare(b.name))

        const tableHtml = `
          <div class="end-overview">
            <table class="end-table">
              <thead>
                <tr>
                  <th style="text-align:left;">Player</th>
                  <th title="Victory Points">🏆</th>
                  <th>🏠</th>
                  <th>🏢</th>
                  <th>1VP</th>
                  <th>⚔️</th>
                  <th>Roads</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr class="pc${r.color}">
                    <td style="text-align:left;"><span class="p-name pc${r.color}">${r.name}</span></td>
                    <td style="font-weight:bold;">${r.total_vps}</td>
                    <td>${r.settlements}</td>
                    <td>${r.cities}</td>
                    <td>${r.dev1vp ?? '-'}</td>
                    <td>${r.knights}</td>
                    <td>${r.roads}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `
        $overview.innerHTML = tableHtml
      }
    } catch (e) { /* noop */ }

    // Tabs behavior
    try {
      const $tabs = Array.from(this.$alert.querySelectorAll('.end-tab'))
      const $contents = Array.from(this.$alert.querySelectorAll('.end-tab-content'))
      $tabs.forEach(btn => btn.addEventListener('click', () => {
        const key = btn.dataset.tab
        $tabs.forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        $contents.forEach(c => {
          c.classList.toggle('hide', c.dataset.tab !== key)
        })
      }))
    } catch (e) { /* noop */ }
  }

  #isMe(p) { return p?.id === this.#player.id }
  #isNotMe(p) { return p?.id !== this.#player.id && p }
}
