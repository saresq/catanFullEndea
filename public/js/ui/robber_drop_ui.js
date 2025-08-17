import * as CONST from "../const.js"

export default class RobberDropUI {
  #res; #total; #goal; #max
  #onDropSubmit; #onTakenBack; #onAddRequested
  $el = document.querySelector('#game > .robber-drop-zone')
  $card_area = this.$el.querySelector('.card-area')
  $dropped_count = this.$el.querySelector('.dropped-count')
  $robber_emoji = this.$el.querySelector('.drop-emoji')
  $drop_submit = this.$el.querySelector('.drop-give-button')

  constructor({ onDropSubmit, onTakenBack, playRobberAudio, onAddRequested }) {
    this.#onDropSubmit = onDropSubmit
    this.#onTakenBack = onTakenBack
    this.#onAddRequested = onAddRequested
    this.$robber_emoji.addEventListener('click', e => playRobberAudio())
  }

  hide() { this.$el.classList.remove('show') }

  render(count, hand_cards) {
    const holding_res = Object.entries(hand_cards)
      .filter(([k, v]) => v && CONST.RESOURCES[k]).map(([k]) => k)
    this.#res = Object.fromEntries(holding_res.map(k => [k, 0]))
    this.#max = Object.fromEntries(holding_res.map(k => [k, hand_cards[k]]))
    this.#total = 0
    this.#goal = count
    this.$card_area.innerHTML = holding_res.map(k => `
      <div class="drop-card" data-type="${k}" data-count="0">
        <button class="ctrl minus" title="Remove one">−</button>
        <button class="ctrl plus" title="Add one">+</button>
      </div>
    `).join('')
    this.$dropped_count.innerHTML = [...Array(count)].map((_, i) => `
      <div class="dropped-count-light l-${i}" style="transform:rotate(${((360) * i / count)}deg)"></div>
    `).join('')
    this.$el.classList.add('show')
    // Initialize button label with 0/#
    this.updateCount()
    this.#addEventListeners()
  }

  #addEventListeners() {
    this.$drop_submit.addEventListener('click', e => {
      if (!e.target.classList.contains('active')) return
      const clean_obj = Object.fromEntries(Object.entries(this.#res)
        .filter(([k]) => CONST.RESOURCES[k]))
      this.#onDropSubmit(clean_obj)
    })
    // Minus: take back one from this slot
    this.$card_area.querySelectorAll('.drop-card .ctrl.minus').forEach($btn => {
      $btn.addEventListener('click', e => {
        e.stopPropagation()
        const $card = e.currentTarget.closest('.drop-card')
        if (!$card) return
        if (!+$card.dataset.count) return
        const type = $card.dataset.type
        if (this.#res[type] === undefined) return
        this.#res[type] -= 1
        this.#total -= 1
        this.updateCount()
        this.#onTakenBack(type)
      })
    })
    // Plus: request to add one (simulate clicking the hand card logic)
    this.$card_area.querySelectorAll('.drop-card .ctrl.plus').forEach($btn => {
      $btn.addEventListener('click', e => {
        e.stopPropagation()
        if (e.currentTarget.classList.contains('disabled')) return
        if (this.hasReachedGoal()) return
        const $card = e.currentTarget.closest('.drop-card')
        if (!$card) return
        const type = $card.dataset.type
        if (!this.isResourceSlotAvailable(type)) return
        if (this.#max && this.#max[type] !== undefined && this.#res[type] >= this.#max[type]) return
        // Delegate to UI to perform the same flow as clicking hand
        this.#onAddRequested?.(type)
      })
    })
  }

  updateCount() {
    // Goal Update
    const goal_reached = this.#goal === this.#total
    this.$drop_submit.classList[goal_reached ? 'add' : 'remove']('active')
    // Update submit button label: show X/# and switch to Discard when goal reached
    if (goal_reached) {
      this.$drop_submit.textContent = 'Discard'
    } else {
      this.$drop_submit.textContent = `${this.#total}/${this.#goal}`
    }
    // Total Update
    this.$dropped_count.dataset.count = this.#total
    this.$dropped_count.querySelectorAll(`.dropped-count .dropped-count-light`).forEach(($el, i) => {
      if (i < this.#total) $el.classList.add('on')
      else $el.classList.remove('on')
    })
    // Resource Update
    Object.entries(this.#res).forEach(([key, value]) => {
      const $drop = this.$card_area.querySelector(`.drop-card[data-type="${key}"]`)
      $drop.dataset.count = value
      $drop.classList[value ? 'add' : 'remove']('valued')
      const $plus = $drop.querySelector('.ctrl.plus')
      if ($plus) {
        const max = this.#max?.[key] ?? Infinity
        $plus.classList[value >= max ? 'add' : 'remove']('disabled')
      }
    })
  }

  give(res_type) {
    this.#res[res_type] += 1
    this.#total += 1
    this.updateCount()
  }

  hasReachedGoal() { return this.#total >= this.#goal }
  isResourceSlotAvailable(res_type) { return this.#res[res_type] !== undefined }
}
