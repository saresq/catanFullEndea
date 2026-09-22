import * as CONST from "../const.js"
const $ = document.querySelector.bind(document)

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
      <span class="spectators-count ${spec_count ? '' : 'hide'}">Spec: <span>${spec_count}</span></span>
      <span class="victory-target" title="Victory points needed to win the game">🏆: ${win_points} · Turn: <span class="dot">⬢</span></span>
      <button class="toggle-players" title="Toggle players panel (Shift)">▼</button>
    </div>`
    this.$el.innerHTML = header + all_players.map(player => `
      <div class="player p${player.id} pc${player.color_id || player.id} ${player.removed ? 'deactivated' : ''} ${player.is_bot ? 'bot' : ''}" data-id="${player.id}" data-level="${player.bot_level || ''}">
        <div class="name" title="${player.name}">${player.name}</div>
        <span class="bot-mark" title="${player.bot_level} bot">${CONST.BOT_ICON}<small>${player.bot_level || ''} bot</small></span>
        <button type="button" class="btn btn--secondary btn--sm replace-bot" title="Replace with a bot" aria-label="Replace ${player.name} with a bot">Bot?</button>
        <div class="victory-points" title="Victory Points"><span>${player.public_vps + (player.private_vps || 0)}</span></div>
        <div class="cards-container">
          <div class="resources card card--xs" data-card="res-back" data-count="${player.resource_count}" title="Resources in hand"
            data-robbable="${player.resource_count > window.game_obj.config.robber_hand_limit}"></div>
          <div class="development-cards card card--xs" data-card="dev-back" title="Development Cards in hand" data-count="${player.dev_card_count}"></div>
          <div class="largest-army" title="Largest Army" data-id="${player.id}"
            data-count="${player.open_dev_cards.dK}"></div>
          <div class="longest-road" title="Longest Road" data-id="${player.id}"
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
    if ($mark) { $mark.title = `${player.bot_level} bot`; $mark.querySelector('small').textContent = `${player.bot_level} bot` }
  }

  /** The host alone sees "Bot?" on quit seats (`.host` on the list gates it in CSS) */
  setHost(host_pid) {
    this.host_pid = host_pid
    this.$el.classList.toggle('host', host_pid === this.player.id)
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
