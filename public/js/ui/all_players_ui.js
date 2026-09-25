import * as CONST from "../const.js"
import { t } from "../i18n.js"
const $ = document.querySelector.bind(document)

/** `easy bot` beside a name; empty for a human. */
const botTag = level => level ? t('score.bot_tag', { level: t(`names.bot_levels.${level}.short`) }) : ''

export default class AllPlayersUI {
  player; opponents
  #showLargestArmy; #showLongestRoad; #showPlayerLongestRoad; #hidePlayerLongestRoad
  $el = $('#game .all-players')
  player_refs = []
  #compact = false
  #onReplaceWithBot; host_pid

  constructor(player, opponents, { showLargestArmy, showLongestRoad,
    showPlayerLongestRoad, hidePlayerLongestRoad, onReplaceWithBot, host_pid }) {
    this.player = player
    this.opponents = opponents
    this.#onReplaceWithBot = onReplaceWithBot
    this.host_pid = host_pid
    this.#showLargestArmy = showLargestArmy
    this.#showLongestRoad = showLongestRoad
    this.#showPlayerLongestRoad = showPlayerLongestRoad
    this.#hidePlayerLongestRoad = hidePlayerLongestRoad
  }

  toggleBlur(bool) { this.$el.classList[bool ? 'add' : 'remove']('blur') }

  render() {
    const all_players = [this.player, ...this.opponents]
      .filter(p => p.id > 0)
      .sort((a, b) => a.id - b.id)
    const win_points = (window.game_obj && window.game_obj.config && window.game_obj.config.win_points) || CONST.GAME_CONFIG.win_points
    const spec_count = (window.game_obj && window.game_obj.spectators_count) || 0
    const header = `<div class="players-header">
      <span class="spectators-count ${spec_count ? '' : 'hide'}">${t('score.spec')} <span>${spec_count}</span></span>
      <span class="victory-target" title="${t('score.victory_target_title')}">${CONST.icon('trophy')} ${win_points} · ${t('score.turn')} <span class="dot">⬢</span></span>
      <button class="toggle-players" title="${t('score.toggle_players')}">▼</button>
    </div>
    <div class="bank" title="${t('score.bank')}" aria-label="${t('score.bank')}">${Object.keys(CONST.RESOURCES).map(res => `
      <span class="stock" data-res="${res}" data-count="0"><span class="res-icon ${res}"></span><span class="count">0</span></span>`).join('')}
    </div>`
    this.$el.innerHTML = header + all_players.map(player => `
      <div class="player p${player.id} pc${player.color_id || player.id} ${player.removed ? 'deactivated' : ''} ${player.is_bot ? 'bot' : ''}" data-id="${player.id}" data-level="${player.bot_level || ''}">
        <div class="seat">
          <div class="name" title="${player.name}">${player.name}</div>
          <span class="bot-mark" title="${botTag(player.bot_level)}">${CONST.BOT_ICON}<small>${botTag(player.bot_level)}</small></span>
          <span class="first-roll" title="${t('score.first_roll')}"></span>
        </div>
        <button type="button" class="btn btn--secondary btn--sm replace-bot" title="${t('score.replace_with_bot')}" aria-label="${t('score.replace_with_bot_aria', { name: player.name })}">${t('score.bot_q')}</button>
        <div class="victory-points" title="${t('score.victory_points')}"><span>${player.public_vps + (player.private_vps || 0)}</span></div>
        <div class="cards-container">
          <div class="resources card card--xs" data-card="res-back" data-count="${player.resource_count}" title="${t('score.resources_in_hand')}"
            data-robbable="${player.resource_count > window.game_obj.config.robber_hand_limit}"><span class="robber-mark" aria-hidden="true">🥷</span></div>
          <div class="development-cards card card--xs" data-card="dev-back" title="${t('score.dev_cards_in_hand')}" data-count="${player.dev_card_count}"></div>
          <div class="largest-army" title="${t('score.largest_army')}" data-id="${player.id}"
            data-count="${player.open_dev_cards.dK}"></div>
          <div class="longest-road" title="${t('score.longest_road')}" data-id="${player.id}"
            data-count="${player.longest_road_list.length}"></div>
        </div>
      </div>
    `).join('')
    this.$el.dataset.army = all_players.find(_ => _.largest_army)?.id || '-'
    this.$el.dataset.road = all_players.find(_ => _.longest_road)?.id || '-'
    this.#setRefs()
    this.#updateTurnIndicator()
    this.$el.querySelector('.toggle-players')?.addEventListener('click', _ => this.toggleCompact())
    this.$el.querySelectorAll('.replace-bot').forEach($_ => $_.addEventListener('click', e => {
      this.#onReplaceWithBot(+e.currentTarget.closest('.player').dataset.id)
    }))
    this.setHost(this.host_pid)
    this.$el.querySelectorAll('.largest-army').forEach($_ => $_.addEventListener('click', e => {
      if (this.$el.dataset.army !== e.target.dataset.id) return
      this.#showLargestArmy(+this.$el.dataset.army)
    }))
    this.$el.querySelectorAll('.longest-road').forEach($_ => $_.addEventListener('click', e => {
      if (this.$el.dataset.road !== e.target.dataset.id) return
      this.#showLongestRoad(+this.$el.dataset.road)
    }))
    this.$el.querySelectorAll('.longest-road').forEach($_ => {
      $_.addEventListener('mouseover', e => this.#showPlayerLongestRoad(+e.target.dataset.id))
      $_.addEventListener('mouseout', e => this.#hidePlayerLongestRoad())
    })

    // Initialize compact state from storage; landscape phones start collapsed
    const saved = localStorage.getItem(CONST.STORAGE_KEYS.ALL_PLAYERS_COMPACT)
    if (saved === '1' || (saved === null && matchMedia('(orientation: landscape) and (max-height: 500px)').matches)) {
      this.toggleCompact(true)
    }
  }

  #setRefs() {
    this.$el.querySelectorAll('.player').forEach($player => {
      this.player_refs[$player.dataset.id] = {
        $p: $player,
        $vps: $player.querySelector('.victory-points span'),
        $roll: $player.querySelector('.first-roll'),
        $res: $player.querySelector('.resources'),
        $dc: $player.querySelector('.development-cards'),
        $army: $player.querySelector('.largest-army'),
        $road: $player.querySelector('.longest-road'),
      }
    })
  }

  updateActive(pid) {
    this.$el.dataset.active = pid
    this.#updateTurnIndicator()
  }

  /** The seat's roll for first player, beside its name; empty once placement starts */
  showRoll(pid, total) { const $roll = this.player_refs[pid]?.$roll; $roll && ($roll.textContent = total) }
  clearRolls() { this.player_refs.forEach(refs => refs?.$roll && (refs.$roll.textContent = '')) }

  /** `pid` lost Longest Road and nobody holds it */
  clearLongestRoad(pid) { if (+this.$el.dataset.road === pid) { this.$el.dataset.road = '-' } }

  /** The header's ⬢ takes the active player's colour; it is the only turn marker. */
  #updateTurnIndicator() {
    const $dot = this.$el.querySelector('.victory-target .dot')
    const $p = this.player_refs[this.$el.dataset.active]?.$p
    if ($dot) $dot.className = 'dot ' + ($p?.className.match(/pc\d+/)?.[0] || '')
  }

  updatePlayer(player, key) {
    const refs = this.player_refs[player.id]
    if (!refs?.$p) return
    const { $p, $vps, $res, $dc, $army, $road } = refs
    const total_vps = player.public_vps + (player.private_vps || 0)
    $vps.innerHTML = total_vps
    $res.dataset.count = player.resource_count
    $res.dataset.robbable = player.resource_count > window.game_obj.config.robber_hand_limit
    $dc.dataset.count = player.dev_card_count
    $army.dataset.count = player.open_dev_cards.dK
    $road.dataset.count = player.longest_road_list.length
    if (player.longest_road) this.$el.dataset.road = player.id
    if (player.largest_army) this.$el.dataset.army = player.id

    // Reflect color change
    if (key?.includes && key.includes('color_id')) {
      $p.classList.remove(...CONST.PC_CLASSES)
      $p.classList.add('pc' + (player.color_id || player.id))
      this.#updateTurnIndicator()
    }
    // Reflect name change
    if (key?.includes && key.includes('name')) {
      const $name = $p.querySelector('.name')
      if ($name) { $name.textContent = player.name; $name.title = player.name }
    }
  }

  deactivatePlayer(pid) {
    this.player_refs[pid]?.$p.classList.add('deactivated')
  }

  /** A bot sat down in a quit seat: back in play, under a new name, marked as a bot */
  reactivateAsBot(player) {
    const $p = this.player_refs[player.id]?.$p
    if (!$p) return
    $p.classList.remove('deactivated')
    $p.classList.add('bot')
    $p.dataset.level = player.bot_level
    const $name = $p.querySelector('.name')
    if ($name) { $name.textContent = player.name; $name.title = player.name }
    const $mark = $p.querySelector('.bot-mark')
    if ($mark) { $mark.title = botTag(player.bot_level); $mark.querySelector('small').textContent = botTag(player.bot_level) }
  }

  /** The host alone sees "Bot?" on quit seats (`.host` on the list gates it in CSS) */
  setHost(host_pid) {
    this.host_pid = host_pid
    this.$el.classList.toggle('host', host_pid === this.player.id)
  }

  /** The bank's five counts; a resource at 0 is marked out */
  updateBank(bank = {}) {
    this.$el.querySelectorAll('.bank .stock').forEach($stock => {
      const n = bank[$stock.dataset.res] ?? 0
      $stock.dataset.count = n
      $stock.querySelector('.count').textContent = n
      $stock.title = `${CONST.RESOURCES[$stock.dataset.res]}: ${n}`
    })
  }

  updateSpectatorCount(count) {
    const $spec = this.$el.querySelector('.spectators-count')
    if (!$spec) return
    $spec.classList[count ? 'remove' : 'add']('hide')
    $spec.querySelector('span').textContent = count
  }

  toggleCompact(force) {
    this.#compact = typeof force === 'boolean' ? force : !this.#compact
    this.$el.classList[this.#compact ? 'add' : 'remove']('compact')
    const btn = this.$el.querySelector('.toggle-players')
    if (btn) {
        btn.textContent = this.#compact ? '▼' : '▲'
    }
    // Persist
    try { localStorage.setItem(CONST.STORAGE_KEYS.ALL_PLAYERS_COMPACT, this.#compact ? '1' : '0') } catch (e) {}
  }
}
