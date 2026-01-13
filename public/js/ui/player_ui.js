import * as CONST from "../const.js"
import { resToText, resToIcons } from "../const_messages.js"
const $ = document.querySelector.bind(document)
const oKeys = Object.keys

export default class PlayerUI {
  #ui; #onDiceClick; #onPieceClick; #onBuyDevCardClick; #onTradeClick; #onExitTrade;
  #onEndTurnClick; #onCardClick; #getPossibleLocations; #toggleBoardBlur; #onDevCardActivate
  #canPlayDevCard
  #is_dev_row_open = false
  player; has_timer; timer; auto_roll; hand

  get maxVisualCards() { return window.innerWidth <= 768 ? 3 : 5 }

  $timer; $dice; $build_road; $build_settlement; $build_city; $buy_dev_card; $trade_btn; $end_turn
  $el = $('#game > .current-player')
  $hand = this.$el.querySelector('.hand')
  $action_bar = this.$el.querySelector('.actions')
  $card_preview = $('#game > .card-preview-zone')

  constructor(player, has_timer, auto_roll, { onDiceClick, onPieceClick, onBuyDevCardClick,
    onTradeClick, onExitTrade, onEndTurnClick, onCardClick, getPossibleLocations,
    toggleBoardBlur, onDevCardActivate, canPlayDevCard }) {
    this.player = player
    this.has_timer = has_timer
    this.auto_roll = auto_roll
    this.#onDiceClick = onDiceClick
    this.#onPieceClick = onPieceClick
    this.#onBuyDevCardClick = onBuyDevCardClick
    this.#onTradeClick = onTradeClick
    this.#onExitTrade = onExitTrade
    this.#onEndTurnClick = onEndTurnClick
    this.#onCardClick = onCardClick
    this.#onDevCardActivate = onDevCardActivate
    this.#canPlayDevCard = canPlayDevCard
    this.#getPossibleLocations = getPossibleLocations
    this.#toggleBoardBlur = toggleBoardBlur
    this.hand = this.#cleanHandData(this.player.closed_cards)
  }

  render() {
    this.renderActionBar()
    // this.hand.S = 3
    // this.hand.L = 7
    // this.hand.B = 2
    // this.hand.dK = 3
    // this.hand.O = 3
    // this.hand.dM = 1
    // this.hand.dR = 1
    // this.hand.dY = 1
    // this.hand.dVp = 2
    this.renderHand()
    this.#setupCardPreviewEvents()
  }

  toggleShow(bool) { this.$el.classList[bool ? 'add' : 'remove']('show') }
  toggleHandBlur(bool) { this.$hand.classList[bool ? 'add' : 'remove']('blur') }
  togglePlayerBlur(bool) { this.$el.classList[bool ? 'add' : 'remove']('blur') }

  updateColor(cid) {
    const pcs = Array.from({ length: 9 }, (_, i) => 'pc' + i)
    pcs.forEach(c => this.$el.classList.remove(c))
    this.$el.classList.add('pc' + cid)
  }

  /**
   * -----------------
   *   ACTION BAR UI
   * -----------------
   */
  //#region
  renderActionBar() {
    this.$el.classList.add('id-' + this.player.id)
    // Apply selected color class to the player container so UI uses color_id theme
    const cid = (this.player.color_id ?? this.player.id)
    this.$el.classList.add('pc' + cid)
    if (this.player.spectator) {
      this.$action_bar.innerHTML = `
        <div class="row-1">
          <div class="timer disabled ${this.has_timer ? '' : 'hide'}">0:00</div>
          <div class="spectating-label">Spectating</div>
        </div>
      `
      this.$timer = this.$action_bar.querySelector('.timer')
      return
    }
    this.$action_bar.innerHTML = `
      <div class="row-1">
        <div class="timer disabled ${this.has_timer ? '' : 'hide'}">0:00</div>
        <button class="trade disabled" title="Trade (t)">Trade</button>
        <button class="dev-toggle hide">
          <span class="text">dev cards</span>
          <span class="caret"></span>
        </button>
      </div>
      <div class="row-2">
        <button class="build-road disabled" title="Build Road (r)" data-count="${CONST.PIECES_COUNT.R}">
          <div class="cost-tooltip">${resToIcons(CONST.COST.R)}</div>
        </button>
        <button class="build-settlement disabled" title="Build Settlement (s)" data-count="${CONST.PIECES_COUNT.S}">
          <div class="cost-tooltip">${resToIcons(CONST.COST.S)}</div>
        </button>
        <button class="build-city disabled" title="Build City (c)" data-count="${CONST.PIECES_COUNT.C}">
          <div class="cost-tooltip">${resToIcons(CONST.COST.C)}</div>
        </button>
        <button class="dev-card disabled" title="Buy Development Card (d)" data-count="-">
          <div class="cost-tooltip">${resToIcons(CONST.COST.DEV_C)}</div>
          <img src="/images/dc-back.png"/>
        </button>
        <button class="roll-dice disabled" data-mode="roll" title="Roll Dice (Space)"><span class="label">🎲</span></button>
      </div>
    `
    this.#setRefs()
    this.#setupActionEvents()
  }

  #setRefs() {
    this.$timer = this.$action_bar.querySelector('.timer')
    this.$dice = this.$action_bar.querySelector('.roll-dice')
    this.$build_road = this.$action_bar.querySelector('.build-road')
    this.$build_settlement = this.$action_bar.querySelector('.build-settlement')
    this.$build_city = this.$action_bar.querySelector('.build-city')
    this.$buy_dev_card = this.$action_bar.querySelector('.dev-card')
    this.$trade_btn = this.$action_bar.querySelector('.trade')
    this.$dev_toggle = this.$action_bar.querySelector('.dev-toggle')
  }

  #$keyToEl(key) {
    return ({
      R: this.$build_road, S: this.$build_settlement,
      C: this.$build_city, DEV_C: this.$buy_dev_card,
    })[key]
  }

  #setupActionEvents() {
    // Unified Dice/End Turn Click
    this.$dice.addEventListener('click', e => {
      const $btn = this.$dice
      if ($btn.classList.contains('disabled')) return
      if ($btn.dataset.mode === 'end') {
        this.#onEndTurnClick()
      } else {
        this.#onDiceClick()
        $btn.classList.add('disabled')
      }
    })
    // Road, Settlement & City Click
    const getEventCb = piece => e => {
      const $el = this.#$keyToEl(piece)
      const classList = $el.classList
      if (classList.contains('disabled')) return
      if ($el.dataset.count === '0') return
      this.#onPieceClick(piece, classList.contains('active'))
      classList.toggle('active')
    }
    const setupLongPress = ($el, piece) => {
      let timer
      let isLongPress = false
      $el.addEventListener('touchstart', e => {
        isLongPress = false
        timer = setTimeout(() => {
          $el.classList.add('show-cost')
          isLongPress = true
        }, 500)
      }, { passive: true })
      $el.addEventListener('touchend', e => {
        clearTimeout(timer)
        $el.classList.remove('show-cost')
        if (isLongPress) e.preventDefault()
      })
      $el.addEventListener('touchcancel', e => {
        clearTimeout(timer)
        $el.classList.remove('show-cost')
      })
    }
    this.$build_road.addEventListener('click', getEventCb('R'))
    setupLongPress(this.$build_road, 'R')
    this.$build_settlement.addEventListener('click', getEventCb('S'))
    setupLongPress(this.$build_settlement, 'S')
    this.$build_city.addEventListener('click', getEventCb('C'))
    setupLongPress(this.$build_city, 'C')
    // Buy Development Card
    this.$buy_dev_card.addEventListener('click', e => {
      if (e.target.classList.contains('disabled')) return
      if (e.target.dataset.count === '0') return
      this.#onBuyDevCardClick()
    })
    setupLongPress(this.$buy_dev_card, 'DEV_C')
    // Trade
    this.$trade_btn.addEventListener('click', e => {
      if (this.$trade_btn.classList.contains('disabled')) return
      this.#onTradeClick()
    })
    // Dev Toggle
    this.$dev_toggle?.addEventListener('click', e => {
      if (this.$dev_toggle.classList.contains('disabled')) return
      const $dev_row = this.$hand.querySelector('.dev-cards-row')
      if (!$dev_row) return
      this.#is_dev_row_open = $dev_row.classList.toggle('hide') === false
      this.$dev_toggle.classList.toggle('open', this.#is_dev_row_open)
    })
    // End Turn (hidden in unified mode)
    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      switch (e.code) {
        case 'KeyR': getEventCb('R')(); break
        case 'KeyS': getEventCb('S')(); break
        case 'KeyC': getEventCb('C')(); break
        case 'KeyD':
          !this.$buy_dev_card.classList.contains('disabled') && this.#onBuyDevCardClick()
          break
        case 'KeyE':
          if (this.$dice.dataset.mode === 'end' && !this.$dice.classList.contains('disabled')) {
            this.#onEndTurnClick()
          }
          break
        case 'KeyT':
          if (this.$trade_btn.classList.contains('disabled')) { break }
          this.#onTradeClick()
          break
        case 'Space':
          e.target === document.body && e.preventDefault()
          if (!this.$dice.classList.contains('disabled')) {
            if (this.$dice.dataset.mode === 'end') {
              this.#onEndTurnClick()
            } else {
              this.#onDiceClick()
              this.$dice.classList.add('disabled')
            }
          }
          break
        case 'Escape':
          if (this.isAnyActionActive()) {
            this.removeActiveActions()
            this.#onPieceClick('', true)
          }
          break
      }
    })
  }

  canIBuy(type) {
    const costs = CONST.COST[type]
    return oKeys(costs).reduce((mem, res_key) => {
      const has_count = this.hand[res_key]
      const icons = this.#$keyToEl(type).querySelectorAll('.cost-tooltip .res-icon.'+res_key)
      icons.forEach(($el, i) => this.toggleAction($el, has_count > i))
      return mem && (has_count >= costs[res_key])
    }, true)
  }

  checkAndToggleActions(toggle) {
    if (this.player.spectator) return
    this.removeActiveActions()
    if (toggle) {
      // Enable end turn on unified button during action phase
      this.setUnifiedModeEnd(true)
      this.toggleAction(this.$trade_btn, true)
      this.toggleAction(this.$dev_toggle, true)
      oKeys(CONST.COST).forEach(key => {
        const can_act = this.canIBuy(key)
          && (key == 'DEV_C' || this.#getPossibleLocations(key).length)
        this.toggleAction(this.#$keyToEl(key), can_act)
      })
    } else {
      for (const $el of this.$action_bar.querySelectorAll('.timer, button:not(.dev-toggle)')) {
        this.toggleAction($el)
      }
      // When actions turn off, also disable unified end-turn state
      this.setUnifiedModeEnd(false)
    }
  }

  isAnyActionActive() {
    let active = false
    for (const $el of this.$action_bar.querySelectorAll('.timer, button')) {
      if ($el.classList.contains('active')) { active = true; break }
    }
    return active
  }

  removeActiveActions() {
    for (const $el of this.$action_bar.querySelectorAll('.timer, button')) {
      $el.classList.remove('active')
    }
  }

  resetTimer(time_in_seconds, isCurrentPlayer) {
    this.timer && clearInterval(this.timer)
    this.toggleAction(this.$timer, isCurrentPlayer)
    time_in_seconds--
    this.timer = setInterval(_ => {
      const seconds = time_in_seconds % 60
      const minutes = Math.floor(time_in_seconds / 60)
      const time_text = minutes + ':' + ('0' + seconds).slice(-2)
      this.$timer.innerHTML = time_text
      --time_in_seconds < 0 && clearInterval(this.timer)
    }, 1000)
  }

  toggleDice(active) {
    // When active, we are in roll mode; when not, we don't touch end-turn mode here
    if (active) this.setUnifiedModeRoll(true)
    else this.setUnifiedModeRoll(false)
  }
  toggleAction($el, toggle) {
    $el?.classList[toggle ? 'remove' : 'add']('disabled')
  }

  #ensureDiceLabel() {
    const span = document.createElement('span')
    span.className = 'label'
    this.$dice.appendChild(span)
    return span
  }

  updatePiecesCount() {
    if (this.player.spectator) return
    this.$build_road.dataset.count = CONST.PIECES_COUNT.R - this.player.pieces.R.length
    this.$build_settlement.dataset.count = CONST.PIECES_COUNT.S - this.player.pieces.S.length
    this.$build_city.dataset.count = CONST.PIECES_COUNT.C - this.player.pieces.C.length
  }

  setDevCardCount(n) {
    if (this.player.spectator) return
    this.$buy_dev_card.dataset.count = n
  }

  // Unified button modes
  setUnifiedModeRoll(enabled) {
    if (!this.$dice) return
    this.$dice.dataset.mode = 'roll'
    this.$dice.classList.remove('end-turn')
    this.$dice.title = 'Roll Dice (Space)'
    const label = this.$dice.querySelector('.label') || this.#ensureDiceLabel()
    label.textContent = '🎲'
    this.toggleAction(this.$dice, enabled)
    this.toggleAction(this.$dev_toggle, true)
  }
  setUnifiedModeEnd(enabled) {
    if (!this.$dice) return
    this.$dice.dataset.mode = 'end'
    this.$dice.classList.add('end-turn')
    this.$dice.title = '⏭️ (e/Space)'
    const label = this.$dice.querySelector('.label') || this.#ensureDiceLabel()
    label.textContent = '⏭️'
    const effective = !!enabled && !this._isEndCooldown
    this.toggleAction(this.$dice, effective)
  }

  startEndTurnCooldown(ms = 1000) {
    if (!this.$dice) return
    // Prevent enabling End Turn during cooldown
    this._isEndCooldown = true
    // Clear previous timer if any
    if (this._endCooldownTimer) { clearTimeout(this._endCooldownTimer); this._endCooldownTimer = null }
    // Switch to End mode but keep disabled
    this.setUnifiedModeEnd(false)
    this._endCooldownTimer = setTimeout(() => {
      this._isEndCooldown = false
      this.setUnifiedModeEnd(true)
      this._endCooldownTimer = null
    }, ms)
  }
  //#endregion

  /**
   * ------------
   *   HAND UI
   * ------------
   */
  //#region
  renderHand() {
    if (this.player.spectator) {
      this.$hand.innerHTML = ''
      this.$hand.classList.add('hide')
      return
    }
    const res_order = ['S', 'L', 'B', 'O', 'W']
    const is_mobile = window.innerWidth <= 768
    const hand_groups = Object.entries(this.hand).sort((a, b) => {
      const a_res_idx = res_order.indexOf(a[0])
      const b_res_idx = res_order.indexOf(b[0])
      if (a_res_idx !== -1 && b_res_idx !== -1) return a_res_idx - b_res_idx
      if (a_res_idx !== -1) return -1
      if (b_res_idx !== -1) return 1
      return a[0].length - b[0].length || a[0].localeCompare(b[0])
    })

    const groupToHtml = ([type, count]) => {
      const visualCount = Math.min(count, this.maxVisualCards)
      return `
        <div
          class="card-group ${type}" data-type="${type}" data-count="${count}"
          ${type === 'dK' ? ' title="Knight (k)" ' : ''}
        >
        <div class="card-count ${count < 2 ? 'hide' : ''}"
          style="left: calc(1.875rem + ${Math.max(0, visualCount - 1) * 4}px);
                 top: -0.75rem;"
        >${count}</div>
        ${[...Array(visualCount)].map((_, j) => {
        return `
            <div class="card ${type}" data-type="${type}"
              style="left: ${j * 4}px; bottom: ${j * 2}px;"
            ></div>
          `
      }).join('')}
        </div>
      `
    }

    const resource_groups = hand_groups.filter(([t]) => res_order.includes(t))
    const dev_card_groups = hand_groups.filter(([t]) => !res_order.includes(t))

    this.$hand.innerHTML = `
      <div class="resources-row">${resource_groups.map(groupToHtml).join('')}</div>
      <div class="dev-cards-row ${this.#is_dev_row_open ? '' : 'hide'}">${dev_card_groups.map(groupToHtml).join('')}</div>
    `
    if (this.$dev_toggle) {
      this.$dev_toggle.classList[dev_card_groups.length ? 'remove' : 'add']('hide')
      this.$dev_toggle.classList[this.#is_dev_row_open ? 'add' : 'remove']('open')
    }
    this.#setupHandEvents()
  }
  #setupHandEvents() {
    this.$hand.querySelectorAll('.card, .card-count').forEach($el => $el.addEventListener('click', e => {
      const $card_group = e.target.closest('.card-group')
      const type = $card_group.dataset.type
      const is_active = $card_group.classList.contains('active')
      const is_dc = CONST.DEVELOPMENT_CARDS[type] && type !== 'dVp'
      // Development cards: keep preview/activation behavior
      if (is_dc) {
        this.showCardPreview(type, true, this.#canPlayDevCard(type))
        return
      }
      // Resource cards
      if (!is_active) {
        // Instead of showing preview for resource cards, trigger Trade UI
        if (!this.$trade_btn?.classList.contains('disabled')) {
          this.#onTradeClick()
          return
        }
        // Fallback: if trade is disabled, keep previous preview behavior
        this.showCardPreview(type, false, false)
        return
      }
      // Active mode (e.g., robber drop): keep existing selection callback
      this.#onCardClick(type)
    }))
  }

  clickCard(type) { this.$hand.querySelector('.card.' + type)?.click() }

  #setupCardPreviewEvents() {
    this.$card_preview.addEventListener('click', e => {
      if (e.target.classList.contains('activate')) {
        if (e.target.classList.contains('hide')) { return }
        const type = this.$card_preview.querySelector('.card').dataset.type
        if (!CONST.DEVELOPMENT_CARDS[type] || type === 'dVp') { return }
        this.#onDevCardActivate(type)
        this.#is_dev_row_open = false
      }
      if (['card', 'card-front', 'card-back'].includes(e.target.className)) { return }
      this.closeCardPreview(true)
    })
    document.addEventListener('keydown', e => {
      e.code === 'Escape' && this.closeCardPreview()
      e.code === 'KeyK' && this.$hand.querySelector('.card.dK')?.click()
    })
  }

  showCardPreview(type, show_info, show_activate) {
    this.#toggleBoardBlur(true); this.togglePlayerBlur(true)
    this.$card_preview.classList.remove('hide', 'activated')
    this.$card_preview.querySelector('.card').dataset.type = type
    show_activate && this.$card_preview.querySelector('.activate').classList.remove('hide')
    show_info && this.$card_preview.querySelector('.info').classList.remove('hide')
  }

  closeCardPreview(activated) {
    this.#toggleBoardBlur(false); this.togglePlayerBlur(false)
    activated && this.$card_preview.classList.add('activated')
    this.$card_preview.classList.add('hide')
    this.$card_preview.querySelector('.activate').classList.add('hide')
    this.$card_preview.querySelector('.info').classList.add('hide')
  }

  #cleanHandData(cards_obj) {
    if (!cards_obj) return {}
    return Object.fromEntries(Object.entries(cards_obj).filter(([_, v]) => v))
  }

  updateHand(player, cards) {
    if (this.player.spectator) return
    this.hand = this.#cleanHandData(player.closed_cards)
    this.renderHand()
    oKeys(CONST.COST).forEach(key => this.canIBuy(key))
  }

  activateResourceCards() {
    this.renderHand()
    const res_selector = oKeys(CONST.RESOURCES).map(k => `.card-group[data-type="${k}"]`).join(',')
    this.$hand.querySelectorAll(res_selector).forEach($el => $el.classList.add('active'))
    const dev_selector = oKeys(CONST.DEVELOPMENT_CARDS).map(k => `.card-group[data-type="${k}"]`).join(',')
    this.$hand.querySelectorAll(dev_selector).forEach($el => $el.classList.add('disabled'))
  }

  /** During Robber Drop */
  toggleHandResource(type, add) {
    const $group = this.$hand.querySelector(`.card-group[data-type="${type}"]`)
    const $count = $group.querySelector('.card-count')
    const count = +$count.innerHTML + (add ? 1 : -1)
    if (add) {
      $group.classList.remove('disabled')
      if (count <= this.maxVisualCards) {
        const $hidden = $group.querySelectorAll('.card.hide')
        if ($hidden.length) $hidden[0].classList.remove('hide')
      }
    } else {
      if (count < 0) return
      if (count < this.maxVisualCards) {
        const $visible = $group.querySelectorAll('.card:not(.hide)')
        if ($visible.length) $visible[$visible.length - 1].classList.add('hide')
      }
      if (count === 0) $group.classList.add('disabled')
    }
    $count.innerHTML = count
    $count.classList.toggle('hide', count < 2)
    const visualCount = Math.min(count, this.maxVisualCards)
    $count.style.left = `calc(1.875rem + ${Math.max(0, visualCount - 1) * 4}px)`
    $count.style.top = `calc(-0.75rem - ${Math.max(0, visualCount - 1) * 2}px)`
    return 1
  }
  //#endregion
}
