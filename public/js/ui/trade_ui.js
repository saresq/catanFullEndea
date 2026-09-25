import * as CONST from "../const.js"
import { t } from "../i18n.js"
import { resToText, getName } from "../const_messages.js";
import { newObject } from "../utils.js";

/**
 * The trade drawer: one Players | Bank switch, a row of cards to get, and the deal. The glowing
 * hand is the row to give (`showHandStakes`, `stakeGive`). Tap a card to stake it, tap the staked
 * bundle in the deal to take it back - there is no separate decrease control. Bank mode picks the
 * best rate the player owns per resource, shows what the bank holds and sends one existing bank
 * request per given resource.
 *
 * Three roles (`renderTradeSelection`): the active player sends requests to the table and trades
 * with the bank; a paired player has the bank alone; anyone else, during the active player's
 * actions phase, proposes to them - freestanding, or as a counter to one of their requests
 * (`openCounter`, seeded with the sides swapped). Every offer is a row in the list above the
 * drawer: Accept / Ignore for whoever it is aimed at, Counter on a request for a non-active
 * player, nothing for a bystander, Withdraw for its author.
 */
export default class TradeUI {
  #giving_res; #taking_res; #mode = 'players'; #max_trade_requests
  #player; #onTradeProposal; #onTradeResponse; #showHandStakes; #getRole; #getBank; #getPlayer
  /** `'active'`, `'bank'` or `'propose'` while open */
  #role = null
  /** The request a counter being composed answers */
  #counter_id = null
  /** Every offer row received this phase, by id */
  #trades = {}
  $submit; $guide; $deal;
  $el = document.querySelector('#game .current-player > .trade-zone')
  $requests = this.$el.querySelector('.trade-requests')
  $card_selection = this.$el.querySelector('.trade-card-selection')

  constructor(player, max_trade_requests, { onTradeProposal, onTradeResponse, showHandStakes, getRole, getBank, getPlayer }) {
    this.#player = player
    this.#max_trade_requests = max_trade_requests
    this.#onTradeProposal = onTradeProposal
    this.#onTradeResponse = onTradeResponse
    this.#showHandStakes = showHandStakes
    this.#getRole = getRole || (() => 'active')
    this.#getBank = getBank || (() => ({}))
    this.#getPlayer = getPlayer || (() => null)
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
    // The row name is CSS `::before` content from `data-caption` (trade.css), so the palette is
    // exactly its five cards. What you give comes straight from the hand in the dock, right below the deal.
    const cards = row => Object.keys(CONST.RESOURCES).map(res => `
      <button class="card pick" data-type="${res}" data-row="${row}" title="${CONST.RESOURCES[res]}"></button>`).join('')
    this.$card_selection.innerHTML = `
      <div class="head">
        <button class="btn btn--sm mode" data-mode="players" aria-pressed="true">${t('trade.players')}</button>
        <button class="btn btn--sm mode" data-mode="bank" aria-pressed="false">${t('trade.bank')}</button>
        <button class="btn btn--quiet btn--sm close" title="${t('trade.close_title')}">✕</button>
      </div>
      <div class="palette get" data-caption="${t('trade.you_want')}"><div class="cards">${cards('get')}</div></div>
      <div class="deal empty">
        <div class="side give"></div>
        <span class="pivot">${t('trade.for')}</span>
        <div class="side get"></div>
        <span class="hint">${t('trade.hint')}</span>
      </div>
      <div class="foot">
        <span class="guide"></span>
        <button class="btn btn--quiet btn--sm reset" type="button" title="${t('trade.clear')}" aria-label="${t('trade.clear')}"></button>
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
    const stock = this.#getBank() || {}
    const proposing = this.#role === 'propose'
    const countering = proposing && this.#counter_id !== null
    // The hand may have shrunk under a stake (an offer accepted): keep whole bundles still held.
    Object.keys(CONST.RESOURCES).forEach(res => {
      const held = this.#player.closed_cards[res] || 0
      this.#giving_res[res] = Math.min(this.#giving_res[res], held - held % this.#rate(res))
      if (bank) { this.#taking_res[res] = Math.min(this.#taking_res[res], stock[res] ?? 0) }
    })
    const total = obj => Object.values(obj).reduce((m, v) => m + v, 0)
    const give_total = total(this.#giving_res), get_total = total(this.#taking_res)
    // What the staked cards buy. Every give amount is a whole number of bundles, so this one is too.
    const buys = Object.keys(CONST.RESOURCES).reduce((m, res) => m + this.#giving_res[res] / this.#rate(res), 0)
    // Counters are free; requests and proposals share the per-player limit
    const over_limit = !countering && this.$requests.querySelectorAll('.ongoing[data-id="-1"] .og-request:not(.deleted):not(.counter)')
      .length >= this.#max_trade_requests

    const stakes = {}
    Object.keys(CONST.RESOURCES).forEach(res => {
      const held = this.#player.closed_cards[res] || 0
      const rate = this.#rate(res), give = this.#giving_res[res], get = this.#taking_res[res]
      const $get = this.$card_selection.querySelector(`.palette.get .pick[data-type="${res}"]`)
      // What staking again would leave you with: the reason a stack greys out, before you read it.
      stakes[res] = { left: held - give, rate: bank ? rate : null, disabled: get > 0 || held - give < rate }
      // Bank mode: the count on the card is the bank's stock; a card the bank is out of cannot be asked for
      const left_in_bank = bank ? (stock[res] ?? 0) - get : Infinity
      $get.disabled = give > 0 || (bank && (get_total >= buys || left_in_bank <= 0))
      if (bank) {
        $get.dataset.stock = stock[res] ?? 0
        $get.title = left_in_bank <= 0
          ? t(stock[res] ? 'trade.bank_low' : 'trade.bank_out', { res: CONST.RESOURCES[res] })
          : `${CONST.RESOURCES[res]} · ${t('trade.bank_stock', { n: stock[res] ?? 0 })}`
      } else {
        delete $get.dataset.stock
        $get.title = CONST.RESOURCES[res]
      }
    })
    this.#showHandStakes(stakes)

    this.#paintSide('give', this.#giving_res)
    this.#paintSide('get', this.#taking_res)
    this.$deal.classList.toggle('empty', !give_total && !get_total)

    this.$submit.textContent = t(bank ? 'trade.trade' : proposing ? 'trade.propose' : 'trade.send_offer')
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
        title="${t('trade.take_back', { res: CONST.RESOURCES[res] })}"
        >${res_obj[res]}<span class="res-icon ${res}"></span><span class="x">✕</span></button>`).join('')
  }

  /** Only what is missing, in the imperative. The chips already say what the trade is. */
  #guideText(bank, buys, get_total, give_total, over_limit) {
    if (!bank && over_limit) { return t('trade.max_open_offers', { n: this.#max_trade_requests }) }
    if (bank && buys > get_total) { return t.plural('trade.choose_more', buys - get_total) }
    if (bank && get_total > buys) { return t.plural('trade.take_back_cards', get_total - buys) }
    if (!bank && give_total && !get_total) { return t('trade.pick_want') }
    if (!bank && !give_total && get_total) { return t('trade.pick_offer') }
    if (!bank && this.#counter_id !== null) {
      const original = this.#trades[this.#counter_id]
      return original ? t('trade.countering', { name: original.player?.name || '' }) : ''
    }
    return ''
  }

  /**
   * Players: the one request the server has always taken, as a proposal (with the request it
   * counters, if any) when it is not this player's turn. Bank: one request per given resource,
   * each at that resource's own rate, splitting the "You get" pool between them first come first
   * served. The requests are disjoint in what they give, so the server validates each on its own.
   */
  #submit() {
    if (this.#mode === 'players') {
      this.#onTradeProposal('Px', this.#giving_res, this.#taking_res, this.#counter_id ?? undefined)
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

  /**
   * Opens the drawer for `role`: `'active'` (Players and Bank), `'bank'` (a paired action phase:
   * the Players mode is not offered), `'propose'` (another player's actions phase: Players only,
   * and the deal goes to them). Anything else is ignored.
   */
  renderTradeSelection(role = 'active') {
    if (!['active', 'bank', 'propose'].includes(role)) { return }
    this.#role = role
    this.#counter_id = null
    this.$card_selection.classList.remove('hide')
    this.$card_selection.dataset.role = role
    this.$card_selection.querySelector('.head .mode[data-mode="players"]').classList.toggle('hide', role === 'bank')
    this.$card_selection.querySelector('.head .mode[data-mode="bank"]').classList.toggle('hide', role === 'propose')
    this.#setMode(role === 'bank' ? 'bank' : 'players')
  }

  /** A counter to request `id`: the drawer opens to propose, seeded with the sides swapped and editable. */
  openCounter(id) {
    const original = this.#trades[id]
    if (!original || this.#getRole() !== 'propose') { return }
    this.renderTradeSelection('propose')
    this.#counter_id = Number.isNaN(+id) ? id : +id
    Object.keys(CONST.RESOURCES).forEach(res => {
      const held = this.#player.closed_cards[res] || 0
      this.#giving_res[res] = Math.min(original.asking[res] || 0, held)
      this.#taking_res[res] = original.giving[res] || 0
    })
    this.#update()
  }

  /** Closes the drawer; the hand goes back to normal only if the drawer was the one showing on it. */
  clearSelections() {
    if (!this.isOpen()) { return }
    this.$card_selection.classList.add('hide')
    this.#counter_id = null
    this.#showHandStakes(null)
  }

  isOpen() { return !this.$card_selection.classList.contains('hide') }

  /** A tap on a glowing hand stack: one bundle at that resource's rate. Disabled stacks never get here. */
  stakeGive(res) {
    this.#giving_res[res] += this.#rate(res)
    this.#update()
  }

  /** The hand or the bank changed: repaint, if open. */
  refresh() { this.isOpen() && this.#update() }

  /** `to`: null for a request to the table, else the seat a proposal is aimed at; `counter_of`: the request a counter answers */
  renderNewRequest(player, { giving={}, asking={}, id, to = null, counter_of = null, ...params } = {}) {
    const trade = { player, giving, asking, id, to, counter_of, ...params }
    this.#trades[id] = trade
    if (player.id === this.#player.id) {
      this.#renderOngoing(trade)
      this.updateOngoing(trade)
      return
    }
    const me = this.#player.id
    const kind = counter_of !== null ? 'counter' : to !== null ? 'proposal' : 'request'
    const aimed_at_me = to === null || to === me
    // Aimed at me: answer it. A request while it is not my turn: counter it too. Aimed at somebody else: just news.
    const actions = [
      aimed_at_me && `<button class="btn btn--primary btn--sm confirm" type="button" data-id="${id}">${t('trade.accept')}</button>`,
      aimed_at_me && `<button class="btn btn--quiet btn--sm ignore" type="button" data-id="${id}">${t('trade.ignore')}</button>`,
      kind === 'request' && this.#getRole() === 'propose'
        && `<button class="btn btn--secondary btn--sm counter" type="button" data-id="${id}">${t('trade.counter')}</button>`,
    ].filter(Boolean).join('')
    this.$requests.insertAdjacentHTML('beforeend', `
      <div class="request ${kind} p${player.id} pc${player.color_id || player.id}" data-id="${id}">
        <span class="name">${player.name}</span>
        ${kind === 'counter' ? `<span class="tag">↩ ${t('trade.counter_tag')}</span>` : ''}
        ${kind === 'proposal' && to !== me ? `<span class="tag">${t('trade.aimed_at', { name: this.#nameOf(to) })}</span>` : ''}
        <span class="giving">${t('trade.gives', { res: resToText(giving) })}</span>
        <span class="asking">${t('trade.wants', { res: resToText(asking) })}</span>
        <div class="actions">${actions}</div>
      </div>
    `)
    const $req = this.$requests.querySelector(`.request[data-id="${id}"]`)
    this.#setupRequestActionEvents($req)
    this.updateOngoing(trade)
  }

  /** The seat a proposal is aimed at, in its colour */
  #nameOf(pid) { return getName(this.#getPlayer(pid)) }

  #setupRequestActionEvents($el) {
    $el.querySelector('.confirm')?.addEventListener('click', e => {
      this.#onTradeResponse(e.target.dataset.id, true)
    })
    $el.querySelector('.ignore')?.addEventListener('click', e => {
      this.#onTradeResponse(e.target.dataset.id)
    })
    $el.querySelector('.counter')?.addEventListener('click', e => {
      this.openCounter(e.target.dataset.id)
    })
  }

  #renderOngoing({ giving, asking, id, to, counter_of }) {
    const $all_req = this.$requests.querySelector('.ongoing[data-id="-1"]')
    const kind = counter_of !== null ? 'counter' : to !== null ? 'proposal' : ''
    const $og_req = `
      <div class="og-request ${kind}" data-id="${id}">
        ${kind === 'counter' ? `<span class="tag">↩</span>` : ''}
        <span class="giving">→${resToText(giving)}</span>
        <span class="for">${t('trade.for')}</span>
        <span class="asking">←${resToText(asking)}</span>
        <button class="btn btn--quiet btn--sm cancel" type="button">${t('trade.withdraw')}</button>
      </div>
    `
    if ($all_req) {
      $all_req.insertAdjacentHTML('beforeend', $og_req)
    } else {
      this.$requests.insertAdjacentHTML('afterbegin', `
        <div class="ongoing" data-id="-1">
          <span class="text">${t('trade.max_requests', { n: this.#max_trade_requests })}</span>${$og_req}
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
  updateOngoing({ id, status, rejected = [], asking }) {
    if (this.#trades[id]) { Object.assign(this.#trades[id], { status, rejected }) }
    const $ongoing = this.$requests.querySelector(`.ongoing[data-id="-1"] .og-request[data-id="${id}"]`)
    if ($ongoing) {
      $ongoing.classList.remove('open', 'closed', 'success', 'failed', 'deleted')
      $ongoing.classList.add(status)
      // The status word is CSS `::after` content, read from this attribute (trade.css)
      $ongoing.dataset.statusLabel = t.has(`trade.status.${status}`) ? t(`trade.status.${status}`) : ''
    }
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

  clearRequests() { this.$requests.innerHTML = ''; this.#trades = {} }
}
