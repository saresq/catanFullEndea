import * as CONST from "../const.js"
const $ = document.querySelector.bind(document)

export default class AllPlayersUI {
  player; opponents
  #showLargestArmy; #showLongestRoad; #showPlayerLongestRoad; #hidePlayerLongestRoad
  $el = $('#game > .all-players')
  player_refs = []
  #compact = false

  constructor(player, opponents, { showLargestArmy, showLongestRoad,
    showPlayerLongestRoad, hidePlayerLongestRoad }) {
    this.player = player
    this.opponents = opponents
    this.#showLargestArmy = showLargestArmy
    this.#showLongestRoad = showLongestRoad
    this.#showPlayerLongestRoad = showPlayerLongestRoad
    this.#hidePlayerLongestRoad = hidePlayerLongestRoad
  }

  toggleBlur(bool) { this.$el.classList[bool ? 'add' : 'remove']('blur') }

  render() {
    const all_players = [this.player, ...this.opponents].sort((a, b) => a.id - b.id)
    const win_points = (window.game_obj && window.game_obj.config && window.game_obj.config.win_points) || CONST.GAME_CONFIG.win_points
    const header = `<div class="players-header"><span class="victory-target" title="Victory points needed to win the game">Win at: ${win_points}</span><button class="toggle-players" title="Toggle players panel (p)">▤</button></div>`
    this.$el.innerHTML = header + all_players.map(player => `
      <div class="player p${player.id} ${player.color_id ? 'pc' + player.color_id : ''} ${player.removed ? 'deactivated' : ''}" data-id="${player.id}">
        <div class="name" data-name="${player.name}">${player.name}</div>
        <div class="victory-points"><span>${player.public_vps + (player.private_vps || 0)}</span></div>
        <div class="cards-container">
          <div class="resources" data-count="${player.resource_count}" title="Resources in hand"
            data-robbable="${player.resource_count > window.game_obj.config.robber_hand_limit}"></div>
          <div class="development-cards" title="Development Cards in hand" data-count="${player.dev_card_count}"></div>
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
    this.$el.querySelector('.toggle-players')?.addEventListener('click', _ => this.toggleCompact())
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

    // Initialize compact state from storage
    const saved = localStorage.getItem('all_players_compact')
    if (saved === '1') { this.toggleCompact(true) }
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

  updateActive(pid) { this.$el.dataset.active = pid }

  updatePlayer(player, key) {
    const { $p, $vps, $res, $dc, $army, $road } = this.player_refs[player.id]
    if (!$p) return
    const total_vps = player.public_vps + (player.private_vps || 0)
    $vps.innerHTML = total_vps
    $res.dataset.count = player.resource_count
    $res.dataset.robbable = player.resource_count > window.game_obj.config.robber_hand_limit
    $dc.dataset.count = player.dev_card_count
    $army.dataset.count = player.open_dev_cards.dK
    $road.dataset.count = player.longest_road_list.length
    if (player.longest_road) this.$el.dataset.road = player.id
    if (player.largest_army) this.$el.dataset.army = player.id

    // Update compact text if needed
    if (this.#compact) {
      const $name = $p.querySelector('.name')
      if ($name) {
        const base = $name.getAttribute('data-name') || $name.textContent
        $name.textContent = `${base} - ${total_vps}`
      }
    }
  }

  deactivatePlayer(pid) {
    this.player_refs[pid]?.$p.classList.add('deactivated')
  }

  toggleCompact(force) {
    this.#compact = typeof force === 'boolean' ? force : !this.#compact
    this.$el.classList[this.#compact ? 'add' : 'remove']('compact')
    const btn = this.$el.querySelector('.toggle-players')
    if (btn) btn.textContent = this.#compact ? '▸' : '▤'
    // Update names
    this.$el.querySelectorAll('.player').forEach($p => {
      const $name = $p.querySelector('.name')
      const $vps = $p.querySelector('.victory-points span')
      if (!$name || !$vps) return
      const base = $name.getAttribute('data-name') || $name.textContent
      if (this.#compact) {
        $name.setAttribute('data-name', base)
        $name.textContent = `${base} - ${$vps.textContent}`
      } else {
        const original = $name.getAttribute('data-name') || base
        $name.textContent = original
      }
    })
    // Persist
    try { localStorage.setItem('all_players_compact', this.#compact ? '1' : '0') } catch (e) {}
  }
}
