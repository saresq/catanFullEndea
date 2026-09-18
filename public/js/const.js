import {
  DEFAULT_MAPKEY, DEFAULT_MAPKEY_5_6, DEFAULT_MAPKEY_7_8, DEFAULT_MAPKEY_9_10, ARGENTUM_MAPKEY,
} from './const_maps.js'

export * from './const_maps.js'

/** Inclusive integer range. `range(2, 4)` -> [2, 3, 4] */
const range = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i)

export const TILES = {
  G: 'Grassland',
  J: 'Jungle',
  C: 'Clay Pit',
  M: 'Mountain',
  F: 'Fields',
  D: 'Desert',
  S: 'Sea',
}

export const RESOURCES = {S: 'Sheep', L: 'Lumber', B: 'Brick', O: 'Ore', W: 'Wheat'}

export const TILE_EMOJIS = {G: '🐑', J: '🪵', C: '🧱', M: '🏔', F: '🌾', S: '🌊', D: '🌵'}

export const SEA_REGEX = `S\\((?<dir>tl|tr|l|r|bl|br)_(?<res>${Object.keys(RESOURCES).join('|')}|\\*)(?<num>\\d*)\\)`

export const RESOURCE_REGEX = `(?<tile_type>[${Object.keys(TILES).join('|')}])(?<num>\\d*)`

export const TILE_RES = {G: 'S', J: 'L', C: 'B', M: 'O', F: 'W'}

/** Dice total that moves the robber. */
export const ROBBER_ROLL = 7

/** The red numbers - treated as one value when spacing numbers out on the board. */
export const RED_NUMBERS = [6, 8]

export const DEVELOPMENT_CARDS = {
  dK: 'Knight', dVp: 'Victory Point',
  dR: 'Road building', dY: 'Year of plenty', dM: 'Monopoly',
}

/** @param {{knights:number, powers:number, vps:number}} counts */
const buildDeck = ({ knights, powers, vps }) => [
  ...Array(knights).fill('dK'),
  ...['dR', 'dY', 'dM'].flatMap(card => Array(powers).fill(card)),
  ...Array(vps).fill('dVp'),
]

/** Rules & dev card deck per player count. Ordered biggest tier first. */
export const PLAYER_TIERS = [
  { min: 9, win_points: 13, robber_hand_limit: 10, deck: buildDeck({ knights: 30, powers: 5, vps: 10 }) },
  { min: 7, win_points: 12, robber_hand_limit: 10, deck: buildDeck({ knights: 24, powers: 4, vps: 8 }) },
  { min: 5, win_points: 11, robber_hand_limit: 8, deck: buildDeck({ knights: 20, powers: 3, vps: 6 }) },
  { min: 2, win_points: 10, robber_hand_limit: 7, deck: buildDeck({ knights: 14, powers: 2, vps: 5 }) },
]

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

export const PIECES = {S: 'Settlement', C: 'City', R: 'Road'}
export const PIECES_COUNT = {S: 5, C: 4, R: 15}

export const COST = {
  R: {L: 1, B: 1},
  S: {L: 1, B: 1, W: 1, S: 1},
  C: {W: 2, O: 3},
  DEV_C: {W: 1, S: 1, O: 1},
}

export const TRADE_OFFERS = {
  S2: 'Sheep 2:1',
  L2: 'Lumber 2:1',
  B2: 'Brick 2:1',
  O2: 'Ore 2:1',
  W2: 'Wheat 2:1',
  '*3': 'Any 3:1',
  '*4': 'Any 4:1',
  Px: 'Player Trade',
}

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
 */
export const MAPS = {
  standard: { name: 'Standard', mapkey: DEFAULT_MAPKEY, max_players: 4 },
  extended: { name: 'Extended', mapkey: DEFAULT_MAPKEY_5_6, max_players: 6 },
  large: { name: 'Large', mapkey: DEFAULT_MAPKEY_7_8, max_players: 8 },
  xlarge: { name: 'Extra Large', mapkey: DEFAULT_MAPKEY_9_10, max_players: 10 },
  argentum: { name: 'Argentum', mapkey: ARGENTUM_MAPKEY, max_players: 10 },
}

export const MAP_LIST = Object.entries(MAPS).map(([id, map]) => ({ id, ...map }))

/** Preset matching a mapkey, or undefined for hand-made maps. */
export const mapOf = mapkey => MAP_LIST.find(m => m.mapkey === mapkey)

/** Display label for any mapkey. */
export const mapName = mapkey => mapOf(mapkey)?.name || 'Custom'

/** Smallest preset that seats `player_count`. */
export const mapForPlayers = player_count =>
  MAP_LIST.find(m => m.max_players >= player_count) || MAPS.xlarge

/** Custom maps are always allowed - only presets are size-checked. */
export const mapFitsPlayers = (mapkey, player_count) => {
  const map = mapOf(mapkey)
  return !map || map.max_players >= player_count
}

export const GAME_CONFIG = {
  // private_game: true,
  player_count: 3,
  win_points: 10,
  timer: true,
  strategize_time: 10,
  initial_build_time: 60,
  auto_roll: false,
  roll_time: 15,
  player_turn_time: 60,
  trade_time_bonus_seconds: 20, // Bonus seconds added on first trade of a turn
  robber_drop_time: 30,
  robber_move_time: 30,
  max_trade_requests: 4,
  alert_time: 3,
  largest_army_count: 3,
  longest_road_count: 5,
  robber_hand_limit: 7, // Default hand limit for triggering robber (will be adjusted based on player count)
  mapkey: DEFAULT_MAPKEY,
  /** @type {false|'none'|'all'|'number'|'port'|'tile'|'(combo of number-port-tile)'} */
  map_shuffle: 'all',
  /** @type {'random'|'balanced'} */
  dice_mode: 'random',
}

export const GAME_STATES = {
  INITIAL_SETUP: 'INITIAL_SETUP',
  PLAYER_ROLL: 'player_roll',
  PLAYER_ACTIONS: 'player_actions',
  ROBBER_DROP: 'drop_resource_for_robber',
  ROBBER_MOVE: 'moving_robber',
  END: 'end',
}

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
  SPECTATOR_COUNT: 'spectator_count',
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
