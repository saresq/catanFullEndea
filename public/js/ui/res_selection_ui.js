import * as CONST from "../const.js"

/**
 * Year of Plenty and Monopoly: the trade drawer with only a "You get" row. Year of Plenty stakes
 * up to 2 cards and a chip takes one back; Monopoly replaces the choice on every pick.
 */
export default class ResSelectionUI {
  type; #onSubmit; #onDevCardClick; #onCancel
  selected = []
  $el = document.querySelector('#game .current-player > .trade-zone > .resource-selection-zone')

  constructor({ onSubmit, onDevCardClick, onCancel }) {
    this.#onSubmit = onSubmit
    this.#onDevCardClick = onDevCardClick
    this.#onCancel = onCancel
  }

  render() {
    this.$el.innerHTML = `
      <div class="head">
        <button class="card dev-card" type="button" title="See the card"></button>
        <div class="title"></div>
        <button class="btn btn--quiet btn--sm close" type="button" title="Close (Esc)">✕</button>
      </div>
      <div class="deal empty">
        <div class="side get"></div>
        <span class="hint"></span>
      </div>
      <div class="palette get"><div class="cards">${Object.keys(CONST.RESOURCES).map(k => `
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

  /** Every `disabled`, the chips and the guide, after every change. */
  #update() {
    const full = this.type === 'dY' && this.selected.length >= this.#max()
    this.$el.querySelectorAll('.palette .pick').forEach($pick => $pick.disabled = full)
    this.$el.querySelector('.deal').classList.toggle('empty', !this.selected.length)
    this.$el.querySelector('.deal .side.get').innerHTML = Object.keys(CONST.RESOURCES)
      .map(k => [k, this.selected.filter(s => s === k).length]).filter(([k, n]) => n).map(([k, n]) => `
        <button class="chip get" type="button" data-type="${k}" title="Take back ${CONST.RESOURCES[k]}"
          >${n}<span class="res-icon ${k}"></span><span class="x">✕</span></button>`).join('')
    const left = this.#max() - this.selected.length
    this.$el.querySelector('.foot .guide').textContent = this.type === 'dM'
      ? (left ? 'Choose the resource to collect from everyone' : '')
      : (left ? `Choose ${left} ${left > 1 ? 'cards' : 'card'}` : '')
    this.$el.querySelector('.foot .submit').disabled = left !== 0
  }

  show(type) {
    if (type !== 'dM' && type !== 'dY') { return }
    this.type = type
    this.selected = []
    this.$el.querySelector('.head .title').textContent = CONST.DEVELOPMENT_CARDS[type]
    this.$el.querySelector('.head .dev-card').dataset.type = type
    this.$el.querySelector('.deal .hint').textContent = type === 'dM'
      ? 'Tap a resource to choose it. Tap another to change.'
      : 'Tap cards to take them. Tap them here to put them back.'
    this.$el.querySelector('.foot .submit').textContent = type === 'dM' ? 'Take all' : 'Take'
    this.#update()
    this.$el.classList.remove('hide')
  }

  hide() { this.$el.classList.add('hide') }
}
