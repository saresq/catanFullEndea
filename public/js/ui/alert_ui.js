import { default as MSG, getName } from "../const_messages.js"
const $ = document.querySelector.bind(document)
const TURN_SEP = '<<<TURN_SEPARATOR>>>'

export default class AlertUI {
  #player; #alert_time; #alert_timer;
  #onStatusUpdate; #showCard
  #status_history = []
  $status_history = $('#game > .status-history-zone')
  $status_history_container = $('#game > .status-history-zone > .container')
  $alert = $('#game > .alert')
  $status_bar = $('#game > .current-player .status-bar')

  constructor(player, alert_time = 3, { onStatusUpdate, showCard }){
    this.#player = player
    this.#onStatusUpdate = onStatusUpdate
    this.#showCard = showCard
    this.#alert_time = alert_time
    // Ensure status history doesn't persist across games (e.g., rematch)
    try {
      const gid = (window && window.game_obj && window.game_obj.id) ? ('' + window.game_obj.id) : null
      if (gid) {
        const prevGid = localStorage.getItem('status_history_gid')
        if (prevGid && prevGid !== gid) {
          localStorage.setItem('status_history', '[]')
        }
        localStorage.setItem('status_history_gid', gid)
      }
    } catch (e) {}
    try {
      this.#status_history = JSON.parse(localStorage.getItem('status_history'))
      if (!(this.#status_history instanceof Array)) { this.#status_history = [] }
    } catch (e) {}
  }

  render() {
    this.$status_bar.innerHTML = this.#player.last_status || '...'
    this.$status_history_container.innerHTML = this.#status_history.map(s => {
      if (s === TURN_SEP) return '<hr class="turn-separator">'
      return `<div class="status">${s}</div>`
    }).join('')
    this.$alert.querySelector('.close').addEventListener('click', e => this.closeBigAlert())
    this.$status_history.querySelector('.close').addEventListener('click', e => this.toggleStatusHistory(false))
    $('#game > .current-player .status-bar-history').addEventListener('click', e => this.toggleStatusHistory())
    document.addEventListener('keydown', e => {
      e.code === 'Backquote' && (this.closeBigAlert(), this.toggleStatusHistory(false))
      e.code === 'KeyH' && this.toggleStatusHistory()
    })
  }

  toggleStatusHistory(show = !this.$status_history.classList.contains('show')) {
    this.$status_history.classList[show ? 'add' : 'remove']('show')
  }

  addTurnSeparator() {
    // Avoid duplicate separators in DOM
    const firstDom = this.$status_history_container.firstElementChild
    const needDomInsert = !(firstDom && firstDom.classList.contains('turn-separator'))
    // Persist separator in history if not already at head
    if (this.#status_history[0] !== TURN_SEP) {
      this.#status_history.unshift(TURN_SEP)
      try { localStorage.setItem('status_history', JSON.stringify(this.#status_history)) } catch (e) {}
    }
    if (needDomInsert) {
      const hr = document.createElement('hr')
      hr.className = 'turn-separator'
      this.$status_history_container.prepend(hr)
    }
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
    this.#status_history.unshift(msg)
    localStorage.setItem('status_history', JSON.stringify(this.#status_history))
    this.$status_history_container.innerHTML = `<div class="status">${msg}</div>` + this.$status_history_container.innerHTML
    this.#onStatusUpdate(msg)
  }

  setStatusBarOnly(message = '...') {
    const msg = message.replace(/<br\/?>/g, '. ')
    this.$status_bar.innerHTML = msg
    this.#onStatusUpdate(msg)
  }

  appendStatus(message = '...') {
    const add = message.replace(/<br\/>?/g, '. ')
    this.$status_bar.innerHTML += add
    // Determine index of the latest status (skip leading separator if present)
    let idx = 0
    if (this.#status_history[0] === TURN_SEP) idx = 1
    if (typeof this.#status_history[idx] === 'string' && this.#status_history[idx] !== TURN_SEP) {
      this.#status_history[idx] = this.$status_bar.innerHTML
      try { localStorage.setItem('status_history', JSON.stringify(this.#status_history)) } catch (e) {}
      const firstStatusEl = this.$status_history_container.querySelector('.status')
      if (firstStatusEl) {
        firstStatusEl.innerHTML = this.$status_bar.innerHTML
      } else {
        this.$status_history_container.innerHTML = `<div class="status">${this.$status_bar.innerHTML}</div>` + this.$status_history_container.innerHTML
      }
    } else {
      // No existing status to append to; create a new one at head
      this.#status_history.unshift(this.$status_bar.innerHTML)
      try { localStorage.setItem('status_history', JSON.stringify(this.#status_history)) } catch (e) {}
      this.$status_history_container.innerHTML = `<div class="status">${this.$status_bar.innerHTML}</div>` + this.$status_history_container.innerHTML
    }
    this.#onStatusUpdate(this.$status_bar.innerHTML)
  }

  alertStrategy(t) { this.setStatusBarOnly(MSG.STRATEGIZE.all(t)) }

  alertInitialSetup(p, turn) {
    const msg = turn < 2 ? MSG.INITIAL_BUILD : MSG.INITIAL_BUILD_2
    if (this.#isMe(p)) this.setStatusBarOnly(msg.self())
    else this.setStatusBarOnly(msg.other(p))
  }
  alertRollTurn(p) {
    if (this.#isMe(p)) {
      if (this._has_shown_roll_alert) { this.setStatusBarOnly(MSG.ROLL_TURN.self()) }
      else { this._has_shown_roll_alert = true; this.setStatusBarOnly(MSG.ROLL_TURN.self()) }
    }
    else { this.setStatusBarOnly(MSG.ROLL_TURN.other(p)) }
  }
  alertDiceValue(p, d1, d2, rob_res) {
    this.addTurnSeparator()
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
  alertGameEnd(p, context) {
    this.setStatus(MSG.END_STATUS.all(this.#isNotMe(p), context.vps))
    this.renderEndGameAlert(this.#isNotMe(p), context)
  }

  renderEndGameAlert(p, { pid, color_id, S, C, dVp, largest_army, longest_road }) {
    // Show content in text element only
    const cid = p?.color_id || color_id || pid
    const content = `
      <div class="game-ended pc${cid}" style="font-family: EagleLake;">
        <div class="title-emoji">🏆</div>
        <div class="player-name">🎖 ${getName(p)} Won 🎖</div>
        <small>
          ${S ? `<div class="pts S"><b>${S} VP:</b> ${S} Settlement</div>` : ''}
          ${C ? `<div class="pts C"><b>${C * 2} VP:</b> ${C} City</div>` : ''}
          ${dVp ? `<div class="pts dVp" data-type="dVp"><b>${dVp} VP:</b> ${dVp} Development Card</div>` : ''}
          ${largest_army ? `<div class="pts army" data-type="lArmy"><b>2 VP:</b> Largest Army with ${largest_army} Knights</div>` : ''}
          ${longest_road ? `<div class="pts road" data-type="lRoad"><b>2 VP:</b> Longest Road with ${longest_road} roads</div>` : ''}
        </small>
        <hr style="margin:10px 0;border-top:1px solid #ccc;"/>
        <div class="rematch-section" style="text-align:center; font-family: EagleLake;">
          <button class="vote-rematch" style="background-color:#4a6741;color:var(--sand-color);border:2px solid var(--sand-color);border-radius:50px;font-size:1.1em;font-weight:bold;word-spacing:3px;padding:6px 20px;margin-top:15px;display:inline-block;">Vote Rematch</button>
          <div class="rematch-timer" style="margin-top:8px;font-size:1em;">⏳ <span class="time-left">240</span>s</div>
          <div class="rematch-status" style="margin-top:8px;font-size:1em;"></div>
        </div>
      </div>
    `;
    this.$alert.querySelector('.text').innerHTML = content;
    this.$alert.classList.add('show')
    this.$alert.querySelectorAll('.dVp, .army, .road').forEach($_ => $_.addEventListener('click', e => {
      this.#showCard(e.target.dataset.type || e.target.parentElement.dataset.type)
    }))
  }

  #isMe(p) { return p?.id === this.#player.id }
  #isNotMe(p) { return p?.id !== this.#player.id && p }
}
