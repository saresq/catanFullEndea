import {
  DEFAULT_MAPKEY, DEFAULT_MAPKEY_5_6, DEFAULT_MAPKEY_7_8, DEFAULT_MAPKEY_9_10, ARGENTUM_MAPKEY,
} from './const_maps.js'
import { t } from './i18n.js'

export * from './const_maps.js'

/** `{ key: t('names.<table>.<key>') }` - a noun table whose labels come from the dictionary. */
const named = (table, keys) => Object.fromEntries(keys.map(k => [k, t(`names.${table}.${k}`)]))

/** Inclusive integer range. `range(2, 4)` -> [2, 3, 4] */
const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i)

export const TILES = named('tiles', ['G', 'J', 'C', 'M', 'F', 'D', 'S'])

export const RESOURCES = named('resources', ['S', 'L', 'B', 'O', 'W'])

export const TILE_EMOJIS = {G: '🐑', J: '🪵', C: '🧱', M: '🏔', F: '🌾', S: '🌊', D: '🌵'}

export const SEA_REGEX = `S\\((?<dir>tl|tr|l|r|bl|br)_(?<res>${Object.keys(RESOURCES).join('|')}|\\*)(?<num>\\d*)\\)`

export const RESOURCE_REGEX = `(?<tile_type>[${Object.keys(TILES).join('|')}])(?<num>\\d*)`

export const TILE_RES = {G: 'S', J: 'L', C: 'B', M: 'O', F: 'W'}

/** Dice total that moves the robber. */
export const ROBBER_ROLL = 7

/** The red numbers - treated as one value when spacing numbers out on the board. */
export const RED_NUMBERS = [6, 8]

export const DEVELOPMENT_CARDS = named('cards', ['dK', 'dVp', 'dR', 'dY', 'dM'])

/** @param {{knights:number, powers:number, vps:number}} counts */
const buildDeck = ({ knights, powers, vps }) => [
  ...Array(knights).fill('dK'),
  ...['dR', 'dY', 'dM'].flatMap(card => Array(powers).fill(card)),
  ...Array(vps).fill('dVp'),
]

/**
 * Rules, dev card deck and resource supply per player count. Ordered biggest tier first. Each tier
 * above the base adds what the 5-6 player expansion adds: 6 Knights, one of each power card and
 * 5 cards of each resource (`t` steps up); the Victory Point counts are this game's own escalation.
 */
export const PLAYER_TIERS = [
  { min: 9, win_points: 13, vps: 10 },
  { min: 7, win_points: 12, vps: 8 },
  { min: 5, win_points: 10, vps: 6 },
  { min: 2, win_points: 10, vps: 5 },
].map(({ min, win_points, vps }, i, tiers) => {
  const t = tiers.length - 1 - i
  return {
    min, win_points,
    deck: buildDeck({ knights: 14 + 6 * t, powers: 2 + t, vps }),
    /** The bank's starting stock of each resource: 19, 24, 29, 34 */
    bank_per_resource: 19 + 5 * t,
  }
})

/** @param {number} player_count */
export const playerTier = player_count =>
  PLAYER_TIERS.find(t => player_count >= t.min) || PLAYER_TIERS[PLAYER_TIERS.length - 1]

/** Seats a game may be configured for, and victory targets it may be played to. */
export const PLAYER_COUNTS = range(2, 10)
export const WIN_POINT_OPTIONS = range(5, 20)

/** Colour ids a player may pick. `0` is reserved for god mode. */
export const COLOR_IDS = range(1, 10)

/** Every `pcN` class - remove all of them before adding a player's current one. */
export const PC_CLASSES = [0, ...COLOR_IDS].map(id => 'pc' + id)

export const LOCS = {CORNER: 'C', EDGE: 'E', TILE: 'T'}

export const PIECES = Object.fromEntries(['S', 'C', 'R'].map(k => [k, t(`names.pieces.${k}.name`)]))
export const PIECES_COUNT = {S: 5, C: 4, R: 15}

export const COST = {
  R: {L: 1, B: 1},
  S: {L: 1, B: 1, W: 1, S: 1},
  C: {W: 2, O: 3},
  DEV_C: {W: 1, S: 1, O: 1},
}

export const TRADE_OFFERS = named('ports', ['S2', 'L2', 'B2', 'O2', 'W2', '*3', '*4', 'Px'])

/** The 2:1 port offers - `['S2', 'L2', ...]`. */
export const PORTS_2_1 = Object.keys(TRADE_OFFERS).filter(t => t.endsWith('2'))

export const DIR_HELPER = {
  KEYS: {tl: 'top_left', tr: 'top_right', r: 'right', br: 'bottom_right', bl: 'bottom_left', l: 'left'},
  MAPKEYS: {top_left: 'tl', top_right: 'tr', right: 'r', bottom_right: 'br', bottom_left: 'bl', left: 'l'},

  OPPOSITES: {
    top_left: 'bottom_right', top_right: 'bottom_left', left: 'r',
    right: 'left', bottom_left: 'top_right', bottom_right: 'top_left',
  },

  EDGE_TO_CORNERS: {
    top_left: ['top', 'top_left'], top_right: ['top', 'top_right'],
    left: ['top_left', 'bottom_left'], right: ['top_right', 'bottom_right'],
    bottom_left: ['bottom', 'bottom_left'], bottom_right: ['bottom', 'bottom_right'],
  }
}

/**
 * Map presets, ordered smallest first. `max_players` gates which presets a game
 * of a given size may use; the first entry that fits is the default for that size.
 * The label is `t('names.maps.<id>')`, looked up where it is shown.
 */
export const MAPS = {
  standard: { mapkey: DEFAULT_MAPKEY, max_players: 4 },
  extended: { mapkey: DEFAULT_MAPKEY_5_6, max_players: 6 },
  large: { mapkey: DEFAULT_MAPKEY_7_8, max_players: 8 },
  xlarge: { mapkey: DEFAULT_MAPKEY_9_10, max_players: 10 },
  argentum: { mapkey: ARGENTUM_MAPKEY, max_players: 10 },
}

export const MAP_LIST = Object.entries(MAPS).map(([id, map]) => ({ id, ...map }))

/** Preset matching a mapkey, or undefined for hand-made maps. */
export const mapOf = mapkey => MAP_LIST.find(m => m.mapkey === mapkey)

/** Preset id for any mapkey, `'custom'` for a hand-made one. What `config.map_size` carries. */
export const mapId = mapkey => mapOf(mapkey)?.id || 'custom'

/** Smallest preset that seats `player_count`. */
export const mapForPlayers = player_count =>
  MAP_LIST.find(m => m.max_players >= player_count) || MAPS.xlarge

/** Custom maps are always allowed - only presets are size-checked. */
export const mapFitsPlayers = (mapkey, player_count) => {
  const map = mapOf(mapkey)
  return !map || map.max_players >= player_count
}

/**
 * What a new game shuffles. A preset always shuffles everything: no game is ever tied to the
 * arrangement printed in the rulebook. A hand-made map keeps the editor's "keep my layout" options.
 * @returns {'none'|'all'|string} a `BoardShuffler.shuffle` type
 */
export const shuffleTypeFor = ({ mapkey, map_shuffle, do_not_shuffle_resources, do_not_shuffle_numbers }) => {
  if (mapOf(mapkey)) return 'all'
  if (!map_shuffle || map_shuffle === 'none') return 'none'
  const parts = []
  if (!do_not_shuffle_resources) parts.push('tile')
  if (!do_not_shuffle_numbers) parts.push('number')
  if (map_shuffle === 'all' || map_shuffle.includes('port')) parts.push('port')
  return parts.length ? parts.join('-') : 'none'
}

export const GAME_CONFIG = {
  // private_game: true,
  player_count: 3,
  win_points: 10,
  timer: true,
  /** Seconds the roll for first player waits before rolling for whoever has not */
  first_roll_time: 10,
  initial_build_time: 60,
  auto_roll: false,
  roll_time: 15,
  player_turn_time: 60,
  trade_time_bonus_seconds: 20, // Bonus seconds added on first trade of a turn
  robber_drop_time: 30,
  robber_move_time: 30,
  max_trade_requests: 4,
  /** Bots may open player trade requests (tryhard does); they answer requests regardless */
  bot_trades: true,
  /** How long a bot waits for the table to answer its request before playing on, humans present */
  bot_trade_wait_ms: 8000,
  /** Requests a bot may open per turn (one at a time; each only when a card short of a build) */
  bot_trade_asks: 2,
  alert_time: 3,
  largest_army_count: 3,
  longest_road_count: 5,
  robber_hand_limit: 7, // Discard on a 7 only above this many resource cards, at every player count
  mapkey: DEFAULT_MAPKEY,
  /** @type {false|'none'|'all'|'number'|'port'|'tile'|'(combo of number-port-tile)'} */
  map_shuffle: 'all',
  /** @type {'random'|'balanced'} */
  dice_mode: 'random',
}

/** Level a bot gets when added; the host adjusts it on the slot. */
export const DEFAULT_BOT_LEVEL = 'medium'

/**
 * Bot levels the lobby offers, in order (the lobby shows them as that many filled dots). `available: false` is shown but cannot be picked, and the
 * server refuses it too (`BOT_LEVELS` in models/game.js).
 */
export const BOT_LEVELS = [
  { id: 'easy', available: true },
  { id: 'medium', available: true },
  { id: 'tryhard', available: true },
].map(l => ({ ...l, name: t(`names.bot_levels.${l.id}.name`), blurb: t(`names.bot_levels.${l.id}.blurb`) }))

/** Robot glyph (Lucide `bot`, MIT): marks a bot seat wherever colour alone would not. `aria-hidden`; pair with text. */
export const BOT_ICON = `<svg class="bot-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`

/** Cross glyph (Lucide `x`, MIT): the host's "remove bot" button. `aria-hidden`; the button carries the label. */
export const CLOSE_ICON = `<svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`

/**
 * Lucide (MIT) paths for the rest of the UI glyphs, one 24-box each. `icon(name)` inlines one as
 * an `aria-hidden` SVG sized by the font (`.lucide` in base.css), so it inherits colour and never
 * depends on the platform's emoji font, unlike the emojis these replace.
 */
const LUCIDE = {
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  'zoom-in': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  'zoom-out': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6"/>',
  'volume-2': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  'volume-x': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  keyboard: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M7 16h10"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  dices: '<rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/>',
  'skip-forward': '<polygon points="5 4 15 12 5 20 5 4"/><path d="M19 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  skull: '<circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/>',
}

/** Inline SVG for a `LUCIDE` name; `cls` adds classes beside `lucide`. Decorative: pair with text or a label. */
export const icon = (name, cls = '') =>
  `<svg class="lucide lucide-${name}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${LUCIDE[name]}</svg>`

export const GAME_STATES = {
  FIRST_ROLL: 'first_roll',
  INITIAL_SETUP: 'INITIAL_SETUP',
  PLAYER_ROLL: 'player_roll',
  PLAYER_ACTIONS: 'player_actions',
  ROBBER_DROP: 'drop_resource_for_robber',
  ROBBER_MOVE: 'moving_robber',
  PAIRED_ACTIONS: 'paired_actions',
  END: 'end',
}

/** Games of this many seats or more pair players: after each turn other seats take an action phase. */
export const PAIRED_MIN_PLAYERS = 5

export const SOCKET_EVENTS = {
  // Client Sends…
  PLAYER_ONLINE: 'player_online',
  ROLL_DICE: 'roll_the_dice',
  SAVE_STATUS: 'save_last_status',
  CLICK_LOC: 'clicked_location',
  BUY_DEV: 'buy_development_card',
  END_TURN: 'end_turn',
  PLAYER_COLOR_CHANGE: 'waiting_room_player_color_change',
  START_GAME: 'waiting_room_start_game',
  REMATCH_VOTE: 'rematch_vote',
  GODMODE_ACTIVATE: 'godmode_activate',
  GODMODE_FREE_RES_ACTIVATE: 'godmode_free_resources_activate',
  CHANGE_CONFIG: 'change_game_config',
  ADD_BOT: 'waiting_room_add_bot',
  REMOVE_BOT: 'waiting_room_remove_bot',
  SET_BOT_LEVEL: 'waiting_room_set_bot_level',
  REPLACE_WITH_BOT: 'replace_quit_player_with_bot',
  // Both Sends…
  INITIAL_SETUP: 'ask/return_initial_setup',
  ROBBER_DROP: 'resources_dropped_to_robber/ack', // Private
  ROBBER_MOVE: 'robber_is_moved',
  TRADE_REQ: 'request_trade',
  TRADE_RESP: 'response_to_trade',
  KNIGHT_MOVE: 'knight_moves_robber/ack',
  ROAD_BUILDING: 'road_building_locations/ack',
  MONOPOLY: 'monopoly_resource/ack', // Private
  YEAR_OF_PLENTY: 'year_of_plenty_resource/ack', // Private
  // Server Sends…
  JOINED_WAITING_ROOM: 'joined_waiting_room',
  FIRST_ROLL: 'first_player_roll',
  PLAYER_COLOR_UPDATED: 'waiting_room_player_color_updated',
  STATE_CHANGE: 'state_change',
  SET_TIMER: 'set_timer',
  BUILD: 'build',
  UPDATE_PLAYER: 'update_player_data', // Private
  DICE_VALUE: 'value_of_rolled_dice',
  RES_RECEIVED: 'total_resources_received', // Private
  DEV_CARD_TAKEN: 'developer_card_deck_taken', // Private
  STOLEN_INFO: 'notify_stolen_resource', // Private
  TRADED_INFO: 'notify_traded_info',
  ONGOING_TRADES: 'update_ongoing_trades_status',
  LARGEST_ARMY: 'largest_army',
  LONGEST_ROAD: 'longest_road',
  GAME_END: 'game_end',
  PLAYER_QUIT: 'player_quit',
  REMATCH_PROGRESS: 'rematch_progress',
  REMATCH_NEW_GAME: 'rematch_new_game',
  GODMODE: 'godmode_activated',
  GODMODE_FREE_RES: 'godmode_free_resources_activated',
  ROLL_DISTRIBUTION: 'dice_roll_distribution',
  BANK: 'bank_update',
  SPECTATOR_COUNT: 'spectator_count',
  SEAT_TAKEN_OVER: 'seat_taken_over_by_bot',
  HOST_CHANGED: 'host_changed',
}

export const AUDIO_FILES = {
  START: 'intro.mp3',
  BUILD_ROAD: 'build-road.mp3',
  BUILD_SETTLEMENT: 'build-settlement.mp3',
  BUILD_CITY: 'build-city.mp3',
  CARD: 'card-flip-2.mp3',
  DICE: 'dice.mp3',
  PLAYER_TURN: 'player-turn.mp3',
  ROBBER: 'robber.mp3',
  TRADE_REQUEST: 'bop.mp3',
  KNIGHT: 'knight.mp3',
  ROAD_BUILDING: 'road-running.mp3',
  MONOPOLY: 'coin-fall.mp3',
  YEAR_OF_PLENTY: 'flute.mp3',
  FAIL: 'fail.mp3',
  LARGEST_ARMY: 'horse-army.mp3',
  LONGEST_ROAD: 'horse-cart.mp3',
  BGM: 'clouds.mp3',
  END: 'start-end.mp3',
  PLAYER_QUIT: 'power-down.mp3',
}

/** Seconds players have to vote for a rematch. */
export const REMATCH_SECONDS = 240

/** Matches the `768px` breakpoint used across the stylesheets. */
export const MOBILE_MAX_WIDTH = 768

export const STORAGE_KEYS = {
  PLAYER_NAME: 'player-name',
  STATUS_HISTORY: 'status_history',
  STATUS_HISTORY_GID: 'status_history_gid',
  MUTE_NOTIFICATIONS: 'mute-notifications',
  ALL_PLAYERS_COMPACT: 'all_players_compact',
  BOARD_VIEW: 'board-view',
}
