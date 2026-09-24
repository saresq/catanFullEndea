import { DEVELOPMENT_CARDS } from "../const.js"
import GAME_MESSAGES from "../const_messages.js"
import { t } from "../i18n.js"

/**
 * An award's caption is its log line without the decorations at either end (👣 … 🐾, ⚔️ … ⚔️),
 * with the count (`<b>7 Roads</b>`) wrapped so it can be shown big.
 */
const awardCaption = html => html
  .replace(/^[\s\p{Extended_Pictographic}\uFE0F]+|[\s\p{Extended_Pictographic}\uFE0F]+$/gu, '')
  .replace(/<b>(\d+)(\s)/, '<b><span class="award-count">$1</span>$2')

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export default class AnimationUI {
  $el = document.querySelector('#game > .animation-zone')
  $res_el = document.querySelector('#game > .resource-animation-zone')

  // Timers and motions of the award playing now
  #award = { timers: [], anims: [] }
  // Awards wait for each other: one that arrives while another plays starts when it has gone
  #awardQueue = []
  #awardPlaying = false

  constructor() {}

  animateResourcesTaken(cards) {
    if (Object.values(cards).reduce((mem, v) => mem + v, 0) <= 0) return
    this.$res_el.className = `resource-animation-zone ready resources-animation`
    this.$res_el.innerHTML = `
      <div class="container">${Object.entries(cards).map(([k, v]) => v ? `
        <div class="res-circle" data-count="${v}">
          <div class="res-icon ${k}"></div>
        </div>` : '').join('')}
      </div>
    `
    setTimeout(_ => this.$res_el.classList.add('start'), 200)
  }

  animateDiceRoll(d1, d2) {
    // Small floating dice result above the dice/unified button; no full-screen overlay and no animation
    const btn = document.querySelector('#game > .current-player .actions .roll-dice')
    if (!btn) return
    // Remove existing float if any
    btn.querySelector('.dice-float')?.remove()
    const box = document.createElement('div')
    box.className = 'dice-float'
    const mk = (n) => `<div class="dice-mini">${Array(n).fill(0).map(_ => '<span class="pip"></span>').join('')}</div>`
    box.innerHTML = `${mk(d1)}${mk(d2)}`
    btn.appendChild(box)
    // Auto-remove after 5 seconds
    setTimeout(() => { box.remove() }, 5000)
  }

  animateDevelopmentCard(type, out) {
    if (!DEVELOPMENT_CARDS[type]) return
    this.$el.className = `animation-zone ready dev-c-animation ${out ? 'out' : 'in'} ${type}`
    this.$el.innerHTML = `
      <div class="card-container">
        <div class="card card--xl card--flip" data-card="${type}"><div class="card-front"></div></div>
      </div>
    `
    setTimeout(_ => this.$el.classList.add('start'), out ? 100 : 300)
  }

  /**
   * Largest Army: the knights played are dealt into a fanned hand, the fan closes and flies into
   * the award banner, which becomes the card's home for ~2s. The land dims meanwhile. ~4.6s.
   * `p` is the player (for the colour), `is_me` picks the "You" wording.
   */
  animateLargestArmy(pid, p, count, is_me) {
    this.#queueAward(() => this.#playLargestArmy(pid, p, count, is_me))
  }

  /**
   * Longest Road: the land dims and a light runs along the road, one road at a time (never the
   * settlements and cities on it), the road pulses twice, then the award banner slides down. ~4.7s.
   * `locs` is the path with its corners (Board.addTakenCornersAlongEdgePath); `is_me` as above.
   */
  animateLongestRoad(pid, p, locs, is_me) {
    if (!locs?.length) return
    this.#queueAward(() => this.#playLongestRoad(pid, p, locs, is_me))
  }

  #queueAward(play) {
    this.#awardQueue.push(play)
    this.#nextAward()
  }

  #nextAward() {
    if (this.#awardPlaying || !this.#awardQueue.length) return
    this.#awardPlaying = true
    this.#award = { timers: [], anims: [] }
    this.#awardQueue.shift()()
  }

  #playLargestArmy(pid, p, count, is_me) {
    const $board = document.querySelector('#game .board')
    this.#dim($board)
    const $banner = this.#showAwardBanner(pid, p, 'army', GAME_MESSAGES.LARGEST_ARMY.all(is_me ? null : p, count))
    const reduce = reducedMotion()
    const n = Math.max(1, count)
    const $knights = document.createElement('div')
    $knights.className = 'award-knights'
    $knights.innerHTML = '<div class="card card--md" data-card="dK"></div>'.repeat(reduce ? 0 : n)
    this.$el.append($knights)
    const cards = [...$knights.children]
    // Even spread, capped so a big army still fits in a hand-sized arch
    const spread = n > 1 ? Math.min(10, 64 / (n - 1)) : 0
    const angle = i => (i - (n - 1) / 2) * spread
    const step = Math.min(260, 1300 / n)
    // Each card is dealt onto the pile at the centre, then swings out to its place in the fan
    cards.forEach(($c, i) => this.#later(350 + i * step, () => this.#motion($c, [
      { opacity: 0, transform: 'translateY(24px) rotate(0deg)' },
      { opacity: 1, transform: 'rotate(0deg)', offset: .3 },
      { opacity: 1, transform: `rotate(${angle(i)}deg)` },
    ], { duration: 460, easing: 'cubic-bezier(.3, .9, .4, 1)', fill: 'forwards' })))
    const gather = reduce ? 0 : 350 + n * step + 450
    // The fan closes back into one pile while the pile flies to where the banner's card will sit
    reduce || this.#later(gather, () => {
      const to = $banner.querySelector('.award-card').getBoundingClientRect()
      const from = $knights.getBoundingClientRect()
      const dx = to.left + to.width / 2 - (from.left + from.width / 2)
      const dy = to.top + to.height / 2 - (from.top + from.height / 2)
      cards.forEach(($c, i) => this.#motion($c, [{ transform: `rotate(${angle(i)}deg)` }, { transform: 'rotate(0deg)' }],
        { duration: 260, easing: 'ease-in', fill: 'forwards' }))
      this.#motion($knights, [
        { transform: 'translate(-50%, -50%)', opacity: 1 },
        { transform: 'translate(-50%, -50%)', opacity: 1, offset: .35 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${to.width / from.width})`, opacity: 0 },
      ], { duration: 650, easing: 'cubic-bezier(.5, 0, .3, 1)', fill: 'forwards' })
    })
    this.#later(gather + 450, () => $banner.classList.remove('pending'))
    this.#endAward($board, $banner, gather + 450 + 2300)
  }

  #playLongestRoad(pid, p, locs, is_me) {
    const $board = document.querySelector('#game .board')
    if (!$board) return this.#awardDone()
    const reduce = reducedMotion()
    const $roads = locs.filter(_ => _.type == 'e')
      .map(({ id }) => $board.querySelector(`.edge[data-id="${id}"]`)).filter(Boolean)
    this.#dim($board)
    const step = 1300 / Math.max(1, $roads.length)
    const flash = [{ transform: 'none' }, { transform: 'scale(1.35)', offset: .35 }, { transform: 'none' }]
    const pulse = [{ transform: 'none' }, { transform: 'scale(1.18)' }, { transform: 'none' }]
    // A road's paint is its ::before: the edge itself is turned into place by CSS
    const onRoad = { pseudoElement: '::before' }
    $roads.forEach(($r, i) => this.#later(350 + i * step, () => {
      $r.classList.add('award-lit')
      reduce || this.#motion($r, flash, { ...onRoad, duration: 450, easing: 'ease-out' })
    }))
    reduce || this.#later(350 + $roads.length * step + 150, () => $roads.forEach($r =>
      this.#motion($r, pulse, { ...onRoad, duration: 500, easing: 'ease-in-out', iterations: 2 })))
    const $banner = this.#showAwardBanner(pid, p, 'road', GAME_MESSAGES.LONGEST_ROAD.all(is_me ? null : p, locs.filter(_ => _.type == 'e').length))
    this.#later(2050, () => $banner.classList.remove('pending'))
    this.#endAward($board, $banner, 4300, () => $roads.forEach($r => $r.classList.remove('award-lit')))
  }

  /** The award banner, laid out but hidden (`pending`) until the caller shows it */
  #showAwardBanner(pid, p, card, caption) {
    const cid = (p && p.color_id) ? p.color_id : pid
    const { x, y, top } = this.#boardArea()
    this.$el.style.setProperty('--award-x', `${x}px`)
    this.$el.style.setProperty('--award-y', `${y}px`)
    this.$el.style.setProperty('--award-top', `${top}px`)
    this.$el.className = 'animation-zone ready award'
    this.$el.innerHTML = `
      <div class="award-banner pending p${pid} pc${cid}">
        <div class="award-card ${card}"></div>
        <div class="award-text">${awardCaption(caption)}<span class="award-vp">+2 ${t('score.victory_points')}</span></div>
      </div>
    `
    return this.$el.querySelector('.award-banner')
  }

  /**
   * Slide the banner out at `at` ms and give the board back, then start the next award, if any.
   * A zone reused since (a development card) is left alone.
   */
  #endAward($board, $banner, at, extra = () => {}) {
    this.#later(at, () => {
      $banner.classList.add('out')
      this.#undim($board)
      extra()
    })
    this.#later(at + 400, () => {
      if (this.$el.contains($banner)) {
        this.$el.className = 'animation-zone'
        this.$el.innerHTML = ''
        ;['--award-x', '--award-y', '--award-top'].forEach(v => this.$el.style.removeProperty(v))
      }
      this.#awardDone()
    })
  }

  #awardDone() {
    this.#awardPlaying = false
    this.#nextAward()
  }

  /**
   * The land fades to dim and back only while an award plays (.award-fade); the rest of the time
   * its filters change at once, e.g. the sepia on the tile under the cursor when moving the robber.
   */
  #dim($board) {
    clearTimeout(this.#fadeTimer)
    $board?.classList.add('award-fade', 'award-dim')
  }

  #undim($board) {
    $board?.classList.remove('award-dim')
    this.#fadeTimer = setTimeout(() => $board?.classList.remove('award-fade'), 600)
  }
  #fadeTimer

  /** Centre and top of the screen area the board uses: beside or below the scoreboard, above the dock (as BoardUI) */
  #boardArea() {
    const dock = document.querySelector('#game > .current-player')?.offsetHeight || 0
    const $sb = document.querySelector('.all-players')
    const fixed = $sb && getComputedStyle($sb).position === 'fixed'
    const side = fixed && !$sb.classList.contains('compact') ? $sb.offsetWidth : 0
    const top = $sb && !fixed ? $sb.getBoundingClientRect().bottom : 0
    return { x: (window.innerWidth - side) / 2, y: top + (window.innerHeight - dock - top) / 2, top }
  }

  #later(ms, fn) { this.#award.timers.push(setTimeout(fn, ms)) }
  #motion($el, frames, opts) { this.#award.anims.push($el.animate(frames, opts)) }
}
