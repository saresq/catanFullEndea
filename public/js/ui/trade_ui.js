import * as CONST from "../const.js"
import { resToText } from "../const_messages.js";
import { newObject } from "../utils.js";

/**
 * The trade drawer: one Players | Bank switch, a row of cards to get, and the deal. The glowing
 * hand is the row to give (`showHandStakes`, `stakeGive`). Tap a card to stake it, tap the staked
 * bundle in the deal to take it back - there is no separate decrease control. Bank mode picks the best rate the player owns per resource and
 * sends one existing bank request per given resource.
 */
export default class TradeUI {
  #giving_res; #taking_res; #mode = 'players'; #max_trade_requests
  #player; #onTradeProposal; #onTradeResponse; #showHandStakes
  $submit; $guide; $deal;
  $el = document.querySelector('#game .current-player > .trade-zone')
  $requests = this.$el.querySelector('.trade-requests')
  $card_selection = this.$el.querySelector('.trade-card-selection')

  constructor(player, max_trade_requests, { onTradeProposal, onTradeResponse, showHandStakes }) {
    this.#player = player
    this.#max_trade_requests = max_trade_requests
    this.#onTradeProposal = onTradeProposal
    this.#onTradeResponse = onTradeResponse
    this.#showHandStakes = showHandStakes
    this.#giving_res = newObject(CONST.RESOURCES, 0)
    this.#taking_res = newObject(CONST.RESOURCES, 0)
  }

  /** Cards to give per card taken: 1 between players, else the best port the player owns. */
  #rate(res) {
    if (this.#mode === 'players') { return 1 }
    if (this.#player.trade_offers[res + '2']) { return 2 }
    if (this.#player.trade_offers['*3']) { return 3 }
    return 4
  }

  render() {
    // The row name is CSS `::before` content (trade.css), so the palette is exactly its five cards.
    // What you give comes straight from the hand in the dock, right below the deal.
    const cards = row => Object.keys(CONST.RESOURCES).map(res => `
      <button class="card pick" data-type="${res}" data-row="${row}" title="${CONST.RESOURCES[res]}"></button>`).join('')
    this.$card_selection.innerHTML = `
      <div class="head">
        <button class="btn btn--sm mode" data-mode="players" aria-pressed="true">Players</button>
        <button class="btn btn--sm mode" data-mode="bank" aria-pressed="false">Bank</button>
        <button class="btn btn--quiet btn--sm close" title="Close (Esc)">✕</button>
      </div>
      <div class="palette get"><div class="cards">${cards('get')}</div></div>
      <div class="deal empty">
        <div class="side give"></div>
        <span class="pivot">for</span>
        <div class="side get"></div>
        <span class="hint">Tap your glowing cards to give. Tap cards here for what you want. Tap a staked card to take it back.</span>
      </div>
      <div class="foot">
        <span class="guide"></span>
        <button class="btn btn--quiet btn--sm reset" type="button" title="Clear the trade" aria-label="Clear the trade"></button>
        <button class="btn btn--primary submit" type="button"></button>
      </div>
    `
    this.$deal = this.$card_selection.querySelector('.deal')
    this.$submit = this.$card_selection.querySelector('.foot .submit')
    this.$guide = this.$card_selection.querySelector('.foot .guide')
    this.#setupEvents()
  }

  /**
   * One listener for the whole drawer. Every control that may not be pressed carries the native
   * `disabled` attribute, which does not fire a click, so there is nothing to guard here.
   */
  #setupEvents() {
    this.$card_selection.addEventListener('click', e => {
      const $staked = e.target.closest('.pick, .chip')
      if ($staked) {
        const { type: res, row } = $staked.dataset
        const step = row === 'give' ? this.#rate(res) : 1
        const res_obj = row === 'give' ? this.#giving_res : this.#taking_res
        res_obj[res] += $staked.classList.contains('pick') ? step : -step
        return this.#update()
      }
      const $mode = e.target.closest('.head .mode')
      if ($mode) { return this.#setMode($mode.dataset.mode) }
      if (e.target.closest('.head .close')) { return this.clearSelections() }
      if (e.target.closest('.foot .reset')) { return this.#setMode(this.#mode) }
      if (e.target.closest('.foot .submit')) { return this.#submit() }
    })
  }

  #setMode(mode) {
    this.#mode = mode
    this.#giving_res = newObject(CONST.RESOURCES, 0)
    this.#taking_res = newObject(CONST.RESOURCES, 0)
    this.$card_selection.dataset.mode = mode
    this.$card_selection.querySelectorAll('.head .mode').forEach($el =>
      $el.setAttribute('aria-pressed', String($el.dataset.mode === mode)))
    this.#update()
  }

  /** The hand's stakes, the deal, every `disabled`, the guide and the submit label, after every change. */
  #update() {
    const bank = this.#mode === 'bank'
    // The hand may have shrunk under a stake (an offer accepted): keep whole bundles still held.
    Object.keys(CONST.RESOURCES).forEach(res => {
      const held = this.#player.closed_cards[res] || 0
      this.#giving_res[res] = Math.min(this.#giving_res[res], held - held % this.#rate(res))
    })
    const total = obj => Object.values(obj).reduce((m, v) => m + v, 0)
    const give_total = total(this.#giving_res), get_total = total(this.#taking_res)
    // What the staked cards buy. Every give amount is a whole number of bundles, so this one is too.
    const buys = Object.keys(CONST.RESOURCES).reduce((m, res) => m + this.#giving_res[res] / this.#rate(res), 0)
    const over_limit = this.$requests.querySelectorAll('.ongoing[data-id="-1"] .og-request:not(.deleted)')
      .length >= this.#max_trade_requests

    const stakes = {}
    Object.keys(CONST.RESOURCES).forEach(res => {
      const held = this.#player.closed_cards[res] || 0
      const rate = this.#rate(res), give = this.#giving_res[res], get = this.#taking_res[res]
      const $get = this.$card_selection.querySelector(`.palette.get .pick[data-type="${res}"]`)
      // What staking again would leave you with: the reason a stack greys out, before you read it.
      stakes[res] = { left: held - give, rate: bank ? rate : null, disabled: get > 0 || held - give < rate }
      $get.disabled = give > 0 || (bank && get_total >= buys)
    })
    this.#showHandStakes(stakes)

    this.#paintSide('give', this.#giving_res)
    this.#paintSide('get', this.#taking_res)
    this.$deal.classList.toggle('empty', !give_total && !get_total)

    this.$submit.textContent = bank ? 'Trade' : 'Send offer'
    this.$submit.disabled = bank
      ? !(buys > 0 && get_total === buys)
      : !(give_total > 0 && get_total > 0 && !over_limit)
    this.$guide.textContent = this.#guideText(bank, buys, get_total, give_total, over_limit)
  }

  /** Repaint one side of the deal, and only when its amounts changed, so chips do not re-enter. */
  #paintSide(row, res_obj) {
    const $side = this.$deal.querySelector(`.side.${row}`)
    const key = Object.keys(CONST.RESOURCES).map(res => res_obj[res]).join()
    if ($side.dataset.key === key) { return }
    $side.dataset.key = key
    $side.innerHTML = Object.keys(CONST.RESOURCES).filter(res => res_obj[res]).map(res => `
      <button class="chip ${row}" type="button" data-type="${res}" data-row="${row}"
        title="Take back ${CONST.RESOURCES[res]}"
        >${res_obj[res]}<span class="res-icon ${res}"></span><span class="x">✕</span></button>`).join('')
  }

  /** Only what is missing, in the imperative. The chips already say what the trade is. */
  #guideText(bank, buys, get_total, give_total, over_limit) {
    const cards = n => `${n} card${n > 1 ? 's' : ''}`
    if (!bank && over_limit) { return `Max ${this.#max_trade_requests} open offers` }
    if (bank && buys > get_total) { return `Choose ${buys - get_total} more ${buys - get_total > 1 ? 'cards' : 'card'}` }
    if (bank && get_total > buys) { return `Take ${cards(get_total - buys)} back` }
    if (!bank && give_total && !get_total) { return 'Pick what you want in return' }
    if (!bank && !give_total && get_total) { return 'Pick what you are offering' }
    return ''
  }

  /**
   * Players: the one request the server has always taken. Bank: one request per given resource,
   * each at that resource's own rate, splitting the "You get" pool between them first come first
   * served. The requests are disjoint in what they give, so the server validates each on its own.
   */
  #submit() {
    if (this.#mode === 'players') {
      this.#onTradeProposal('Px', this.#giving_res, this.#taking_res)
    } else {
      const pool = { ...this.#taking_res }
      Object.keys(CONST.RESOURCES).forEach(res => {
        const give = this.#giving_res[res]
        if (!give) { return }
        const rate = this.#rate(res)
        const part = newObject(CONST.RESOURCES, 0)
        let left = give / rate
        Object.keys(pool).forEach(k => {
          const take = Math.min(left, pool[k])
          part[k] += take; pool[k] -= take; left -= take
        })
        const giving = newObject(CONST.RESOURCES, 0)
        giving[res] = give
        this.#onTradeProposal(rate === 2 ? res + '2' : '*' + rate, giving, part)
      })
    }
    this.clearSelections()
  }

  renderTradeSelection() {
    this.$card_selection.classList.remove('hide')
    this.#setMode('players')
  }

  /** Closes the drawer; the hand goes back to normal only if the drawer was the one showing on it. */
  clearSelections() {
    if (!this.isOpen()) { return }
    this.$card_selection.classList.add('hide')
    this.#showHandStakes(null)
  }

  isOpen() { return !this.$card_selection.classList.contains('hide') }

  /** A tap on a glowing hand stack: one bundle at that resource's rate. Disabled stacks never get here. */
  stakeGive(res) {
    this.#giving_res[res] += this.#rate(res)
    this.#update()
  }

  /** The hand changed: repaint, if open. */
  refresh() { this.isOpen() && this.#update() }

  renderNewRequest(player, { giving={}, asking={}, id, ...params } = {}) {
    if (player.id === this.#player.id) {
      this.#renderOngoing({ giving, asking, id, ...params })
      this.updateOngoing({ giving, asking, id, ...params })
      return
    }
    this.$requests.insertAdjacentHTML('beforeend', `
      <div class="request p${player.id} pc${player.color_id || player.id}" data-id="${id}">
        <span class="name">${player.name}</span>
        <span class="giving">gives ${resToText(giving)}</span>
        <span class="asking">wants ${resToText(asking)}</span>
        <div class="actions">
          <button class="btn btn--primary btn--sm confirm" type="button" data-id="${id}">Accept</button>
          <button class="btn btn--quiet btn--sm ignore" type="button" data-id="${id}">Ignore</button>
        </div>
      </div>
    `)
    const $req = this.$requests.querySelector(`.request[data-id="${id}"]`)
    this.#setupRequestActionEvents($req)
    this.updateOngoing({ giving, asking, id, ...params })
  }

  #setupRequestActionEvents($el) {
    $el.querySelector('.confirm').addEventListener('click', e => {
      this.#onTradeResponse(e.target.dataset.id, true)
    })
    $el.querySelector('.ignore').addEventListener('click', e => {
      this.#onTradeResponse(e.target.dataset.id)
    })
  }

  #renderOngoing({ giving, asking, id }) {
    const $all_req = this.$requests.querySelector('.ongoing[data-id="-1"]')
    const $og_req = `
      <div class="og-request" data-id="${id}">
        <span class="giving">→${resToText(giving)}</span>
        <span class="for">for</span>
        <span class="asking">←${resToText(asking)}</span>
        <button class="btn btn--quiet btn--sm cancel" type="button">Withdraw</button>
      </div>
    `
    if ($all_req) {
      $all_req.insertAdjacentHTML('beforeend', $og_req)
    } else {
      this.$requests.insertAdjacentHTML('afterbegin', `
        <div class="ongoing" data-id="-1">
          <span class="text">Max ${this.#max_trade_requests} Requests: </span>${$og_req}
        </div>
      `)
    }
    this.$requests.querySelector(`.ongoing[data-id="-1"] .og-request[data-id="${id}"] .cancel`).addEventListener('click', e => {
      // Withdraw: responding to your own request deletes it (models/game.js tradeResponseIO)
      if (!e.target.closest('.og-request').classList.contains('open')) return
      this.#onTradeResponse(id)
    })
  }

  /** @param {{status:('open'|'closed'|'success'|'failed'|'deleted')}} */
  updateOngoing({ id, status, rejected, asking }) {
    const $ongoing = this.$requests.querySelector(`.ongoing[data-id="-1"] .og-request[data-id="${id}"]`)
    if ($ongoing) { $ongoing.className = 'og-request ' + status }
    // Request list
    const $req = this.$requests.querySelector(`.request[data-id="${id}"]`)
    const show_req = status === 'open' && !rejected.includes(this.#player.id)
    $req?.classList[show_req ? 'remove' : 'add']('hide')
    if (show_req) {
      const can_trade = this.#player.hasAllResources(asking)
      $req?.querySelector('.asking').classList[can_trade ? 'remove' : 'add']('disabled')
      const $confirm = $req?.querySelector('.confirm')
      if ($confirm) { $confirm.disabled = !can_trade }
    }
    // The open-offer limit and the held amounts both live in the drawer's summary and buttons.
    this.refresh()
  }

  clearRequests() { this.$requests.innerHTML = '' }
}
