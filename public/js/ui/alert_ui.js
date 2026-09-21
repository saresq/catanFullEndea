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
      e.target.closest('a, .show-end-game') || this.toggleStatusHistory()
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

  /** Reopens the results as they are: re-rendering would detach the rematch vote and countdown. */
  showEndGameButton() {
    if ($('#game .show-end-game')) return
    const $btn = document.createElement('button')
    $btn.className = 'btn btn--quiet btn--sm show-end-game'
    $btn.textContent = 'Results'
    $btn.addEventListener('click', () => this.$alert.classList.add('show'))
    $('#game > .current-player .status-bar').append($btn)
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
    // The results own the alert once the game has ended; later alerts go to the status bar only.
    if ($alert_text.querySelector('.game-ended')) return void (no_status || this.setStatusBarOnly(message))
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
    if (drop_count) this.setStatusBarOnly(MSG.ROBBER.self(drop_count))
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

  renderEndGameAlert(p, { pid, color_id, dVps }, game) {
    const cid = p?.color_id || color_id || pid
    const rows = [this.#player, ...game.opponents].filter(pl => !pl.spectator).map(pl => {
      const S = pl.pieces.S.length, C = pl.pieces.C.length, dVp = dVps?.[pl.id] ?? 0
      const army = pl.largest_army ? 2 : 0, road = pl.longest_road ? 2 : 0
      return {
        pl, total: S + 2 * C + dVp + army + road,
        cells: [[S], [2 * C, C], [dVp], [army, pl.open_dev_cards.dK], [road, pl.longest_road_list.length]],
      }
    }).sort((a, b) => !!a.pl.removed - !!b.pl.removed || (b.pl.id === pid) - (a.pl.id === pid) || b.total - a.total)
    // Main number is the VP the column gives; the count sits under it where it differs.
    const cell = ([vp, count = vp]) => `<td>${vp || '–'}${count !== vp ? `<small>${count}</small>` : ''}</td>`
    const icon = '<div class="pts-icon"></div>'
    const head = [
      ['Player', 'name'], ['VP', 'total', '<div class="vp-icon"></div>'], ['Settlements', 'S', icon], ['Cities', 'C', icon],
      ['VP cards', 'dVp', '<div class="card card--xs" data-card="dVp"></div>', 'dVp'],
      ['Largest Army', 'army', icon, 'lArmy'], ['Longest Road', 'road', icon, 'lRoad'],
    ]
    this.$alert.querySelector('.text').innerHTML = `
      <div class="game-ended pc${cid}">
        <div class="title-emoji">🏆</div>
        <div class="player-name">🎖 ${getName(p)} Won 🎖</div>
        <div class="end-overview">
          <table class="end-table">
            <thead><tr>${head.map(([label, cls, icon = '', type]) =>
              `<th class="${cls}"${type ? ` data-type="${type}"` : ''}>${icon}<span class="label">${label}</span></th>`).join('')}</tr></thead>
            <tbody>${rows.map(({ pl, total, cells }) => `
              <tr class="pc${pl.color_id || pl.id}${pl.id === pid ? ' winner' : ''}${pl.removed ? ' left' : ''}">
                <td class="name"><div><span class="p-name">${this.#isMe(pl) ? 'You' : pl.name}</span>${pl.removed ? '<small>left</small>' : ''}</div></td>
                <td class="total"><span>${total}</span></td>${cells.map(cell).join('')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="rematch-section">
          <div class="rematch-vote-row">
            <button class="btn btn--primary vote-rematch">Vote Rematch</button>
            <div class="rematch-timer">⏳ <span class="time-left">${REMATCH_SECONDS}</span>s</div>
          </div>
          <div class="rematch-status"></div>
        </div>
      </div>`
    this.$alert.classList.add('show')
    this.$alert.querySelectorAll('.end-table th[data-type]').forEach($th => {
      $th.addEventListener('click', () => this.#showCard($th.dataset.type))
    })
  }

  #isMe(p) { return p?.id === this.#player.id }
  #isNotMe(p) { return p?.id !== this.#player.id && p }
}
