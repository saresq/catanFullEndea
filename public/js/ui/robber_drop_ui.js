import * as CONST from "../const.js"
import { t } from "../i18n.js"
import { default as MSG } from "../const_messages.js"

/**
 * The discard drawer: the trade drawer's header, deal and foot, with no palette of its own. The
 * glowing cards in the hand are the palette (`onStakes`, as the trade drawer does): tapping one
 * reaches `game.onCardClick()`, which checks and calls `give()`; a staked chip puts the card back.
 */
export default class RobberDropUI {
  #res; #total; #goal; #max; #waiting = false
  #onDropSubmit; #onStakes
  $el = document.querySelector('#game .current-player > .trade-zone > .robber-drop-zone')

  constructor({ onDropSubmit, onStakes, playRobberAudio }) {
    this.#onDropSubmit = onDropSubmit
    this.#onStakes = onStakes
    // One listener for the whole drawer. Controls that may not be pressed carry the native
    // `disabled` attribute, which does not fire a click.
    this.$el.addEventListener('click', e => {
      if (e.target.closest('.robber')) { return playRobberAudio() }
      if (this.#waiting) { return }
      const $chip = e.target.closest('.chip')
      if ($chip) {
        const type = $chip.dataset.type
        this.#res[type] -= 1
        this.#total -= 1
        return this.updateCount()
      }
      if (e.target.closest('.foot .submit')) {
        this.setWaiting(true)
        this.#onDropSubmit({ ...this.#res })
      }
    })
  }

  /** Closes the drawer; the hand goes back to normal only if the drawer was the one showing on it. */
  hide() {
    if (this.$el.classList.contains('hide')) { return }
    this.$el.classList.add('hide')
    this.#onStakes(null)
  }

  render(count, hand_cards) {
    this.#res = Object.fromEntries(Object.keys(CONST.RESOURCES).map(k => [k, 0]))
    this.#max = Object.fromEntries(Object.keys(CONST.RESOURCES).map(k => [k, hand_cards[k] || 0]))
    this.#total = 0
    this.#goal = count
    this.$el.innerHTML = `
      <div class="head">
        <button class="robber" type="button" title="${t('robber.robber')}">🥷</button>
        <div class="title">${MSG.ROBBER.self(count)}</div>
        <span class="counter"></span>
      </div>
      <div class="deal empty">
        <div class="side give"></div>
        <span class="hint">${t('robber.hint')}</span>
      </div>
      <div class="foot">
        <span class="guide"></span>
        <button class="btn btn--primary submit" type="button">${t('robber.discard')}</button>
      </div>
      <div class="waiting">${t('robber.waiting')}</div>
    `
    this.setWaiting(false)
    this.$el.classList.remove('hide')
  }

  /** The hand's stakes, the chips, the counter, the guide and the submit, after every change. */
  updateCount() {
    const done = this.#total >= this.#goal
    const $deal = this.$el.querySelector('.deal')
    $deal.classList.toggle('empty', !this.#total)
    // Repaint the chips only when the amounts changed, so they do not re-enter.
    const $side = $deal.querySelector('.side.give'), key = Object.values(this.#res).join()
    if ($side.dataset.key !== key) {
      $side.dataset.key = key
      $side.innerHTML = Object.keys(CONST.RESOURCES).filter(k => this.#res[k]).map(k => `
        <button class="chip give" type="button" data-type="${k}" title="${t('robber.take_back', { res: CONST.RESOURCES[k] })}"
          >${this.#res[k]}<span class="res-icon ${k}"></span><span class="x">✕</span></button>`).join('')
    }
    const $counter = this.$el.querySelector('.head .counter')
    $counter.textContent = `${this.#total} / ${this.#goal}`
    $counter.classList.toggle('done', done)
    const left = this.#goal - this.#total
    this.$el.querySelector('.foot .guide').textContent = left > 0 ? t('robber.choose_more', { n: left }) : ''
    this.$el.querySelector('.foot .submit').disabled = this.#total !== this.#goal
    // `left` is absolute, so a hand update that lands while waiting renders the same numbers.
    this.#onStakes(Object.fromEntries(Object.keys(CONST.RESOURCES).map(k => {
      const left = this.#max[k] - this.#res[k]
      return [k, { left, disabled: this.#waiting || done || !left }]
    })))
  }

  give(res_type) {
    this.#res[res_type] += 1
    this.#total += 1
    this.updateCount()
  }

  hasReachedGoal() { return this.#total >= this.#goal }
  isResourceSlotAvailable(res_type) { return this.#max?.[res_type] - this.#res?.[res_type] > 0 }
  setWaiting(flag) {
    this.#waiting = !!flag
    this.$el.classList.toggle('waiting', this.#waiting)
    this.updateCount()
  }
  isWaiting() { return this.#waiting }
}
