import * as CONST from "../const.js"
import { t } from "../i18n.js"

/**
 * Year of Plenty and Monopoly: the trade drawer with only a "You get" row. Year of Plenty stakes
 * up to 2 cards the bank holds and a chip takes one back; Monopoly replaces the choice on every pick.
 */
export default class ResSelectionUI {
  type; #onSubmit; #onDevCardClick; #onCancel; #getBank
  selected = []
  $el = document.querySelector('#game .current-player > .trade-zone > .resource-selection-zone')

  constructor({ onSubmit, onDevCardClick, onCancel, getBank }) {
    this.#onSubmit = onSubmit
    this.#onDevCardClick = onDevCardClick
    this.#onCancel = onCancel
    this.#getBank = getBank || (() => ({}))
  }

  render() {
    this.$el.innerHTML = `
      <div class="head">
        <button class="card dev-card" type="button" title="${t('picker.see_card')}"></button>
        <div class="title"></div>
        <button class="btn btn--quiet btn--sm close" type="button" title="${t('picker.close_title')}">✕</button>
      </div>
      <div class="deal empty">
        <div class="side get"></div>
        <span class="hint"></span>
      </div>
      <div class="palette get" data-caption="${t('picker.you_get')}"><div class="cards">${Object.keys(CONST.RESOURCES).map(k => `
        <button class="card pick" type="button" data-type="${k}" title="${CONST.RESOURCES[k]}"></button>`).join('')}
      </div></div>
      <div class="foot">
        <span class="guide"></span>
        <button class="btn btn--primary submit" type="button"></button>
      </div>
    `
    // One listener for the whole drawer; `disabled` controls do not fire a click.
    this.$el.addEventListener('click', e => {
      const $pick = e.target.closest('.pick')
      if ($pick) {
        this.selected = this.type === 'dM' ? [$pick.dataset.type] : [...this.selected, $pick.dataset.type]
        return this.#update()
      }
      const $chip = e.target.closest('.chip')
      if ($chip) {
        this.selected.splice(this.selected.indexOf($chip.dataset.type), 1)
        return this.#update()
      }
      if (e.target.closest('.head .dev-card')) { return this.#onDevCardClick(this.type) }
      if (e.target.closest('.head .close')) { this.hide(); return this.#onCancel() }
      if (e.target.closest('.foot .submit')) {
        this.#onSubmit(this.type, this.selected[0], this.selected[1])
        this.hide()
      }
    })
  }

  #max() { return this.type === 'dM' ? 1 : 2 }

  /**
   * Every `disabled`, the chips and the guide, after every change. Year of Plenty takes from the
   * bank: a card it is out of cannot be picked, unless the whole bank holds fewer than two, when
   * any ask takes what is there.
   */
  #update() {
    const plenty = this.type === 'dY'
    const full = plenty && this.selected.length >= this.#max()
    const bank = this.#getBank() || {}
    const stock = Object.values(bank).reduce((m, v) => m + v, 0)
    this.$el.querySelectorAll('.palette .pick').forEach($pick => {
      const res = $pick.dataset.type
      const left = (bank[res] ?? 0) - this.selected.filter(s => s === res).length
      // Two or more in the bank: a card it is out of; one: any ask takes it; none: nothing to take
      const out = plenty && (stock >= 2 ? left <= 0 : stock === 0)
      $pick.disabled = full || out
      if (plenty) {
        $pick.dataset.stock = bank[res] ?? 0
        $pick.title = out ? t(bank[res] ? 'trade.bank_low' : 'trade.bank_out', { res: CONST.RESOURCES[res] })
          : `${CONST.RESOURCES[res]} · ${t('trade.bank_stock', { n: bank[res] ?? 0 })}`
      } else {
        delete $pick.dataset.stock
        $pick.title = CONST.RESOURCES[res]
      }
    })
    this.$el.querySelector('.deal').classList.toggle('empty', !this.selected.length)
    this.$el.querySelector('.deal .side.get').innerHTML = Object.keys(CONST.RESOURCES)
      .map(k => [k, this.selected.filter(s => s === k).length]).filter(([k, n]) => n).map(([k, n]) => `
        <button class="chip get" type="button" data-type="${k}" title="${t('picker.take_back', { res: CONST.RESOURCES[k] })}"
          >${n}<span class="res-icon ${k}"></span><span class="x">✕</span></button>`).join('')
    const left = this.#max() - this.selected.length
    this.$el.querySelector('.foot .guide').textContent = this.type === 'dM'
      ? (left ? t('picker.monopoly_guide') : '')
      : (left ? t.plural('picker.choose_cards', left) : '')
    this.$el.querySelector('.foot .submit').disabled = left !== 0
  }

  show(type) {
    if (type !== 'dM' && type !== 'dY') { return }
    this.type = type
    this.selected = []
    this.$el.querySelector('.head .title').textContent = CONST.DEVELOPMENT_CARDS[type]
    this.$el.querySelector('.head .dev-card').dataset.type = type
    this.$el.querySelector('.deal .hint').textContent = t(type === 'dM' ? 'picker.monopoly_hint' : 'picker.plenty_hint')
    this.$el.querySelector('.foot .submit').textContent = t(type === 'dM' ? 'picker.take_all' : 'picker.take')
    this.#update()
    this.$el.classList.remove('hide')
  }

  hide() { this.$el.classList.add('hide') }

  /** The bank changed: repaint, if open */
  refresh() { !this.$el.classList.contains('hide') && this.type && this.#update() }
}
