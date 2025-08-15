export const TILES = {
  G: 'Grassland',
  J: 'Jungle',
  C: 'Clay Pit',
  M: 'Mountain',
  F: 'Fields',
  D: 'Desert',
  S: 'Sea',
}

export const RESOURCES = { S: 'Sheep', L: 'Lumber', B: 'Brick', O: 'Ore', W: 'Wheat'}

export const RESOURCE_EMOJIS = { S: '🐑', L: '🪵', B: '🧱', O: '🏔', W: '🌾' }
export const TILE_EMOJIS = { G: '🐑', J: '🪵', C: '🧱', M: '🏔', F: '🌾', S: '🌊', D: '🌵' }

export const SEA_REGEX = `S\\((?<dir>tl|tr|l|r|bl|br)_(?<res>${Object.keys(RESOURCES).join('|')}|\\*)(?<num>\\d*)\\)`

export const RESOURCE_REGEX = `(?<tile_type>[${Object.keys(TILES).join('|')}])(?<num>\\d*)`

export const TILE_RES = { G: 'S',  J: 'L',  C: 'B',  M: 'O',  F: 'W'}

export const DEVELOPMENT_CARDS = {
  dK: 'Knight', dVp: 'Victory Point',
  dR: 'Road building', dY: 'Year of plenty', dM: 'Monopoly',
}

// Standard deck for 2-4 players
export const DEVELOPMENT_CARDS_DECK_STANDARD = []
DEVELOPMENT_CARDS_DECK_STANDARD.push(...[...Array(14)].map(_ => 'dK')) // 14 Knights
DEVELOPMENT_CARDS_DECK_STANDARD.push('dR','dR', 'dY','dY', 'dM','dM') // 2 of each power cards
DEVELOPMENT_CARDS_DECK_STANDARD.push(...[...Array(5)].map(_ => 'dVp')) // 5 victory points

// Extended deck for 5-6 players
export const DEVELOPMENT_CARDS_DECK_5_6 = []
DEVELOPMENT_CARDS_DECK_5_6.push(...[...Array(20)].map(_ => 'dK')) // 20 Knights
DEVELOPMENT_CARDS_DECK_5_6.push('dR','dR','dR', 'dY','dY','dY', 'dM','dM','dM') // 3 of each power cards
DEVELOPMENT_CARDS_DECK_5_6.push(...[...Array(6)].map(_ => 'dVp')) // 6 victory points

// Extended deck for 7-8 players
export const DEVELOPMENT_CARDS_DECK_7_8 = []
DEVELOPMENT_CARDS_DECK_7_8.push(...[...Array(24)].map(_ => 'dK')) // 24 Knights
DEVELOPMENT_CARDS_DECK_7_8.push('dR','dR','dR','dR', 'dY','dY','dY','dY', 'dM','dM','dM','dM') // 4 of each power cards
DEVELOPMENT_CARDS_DECK_7_8.push(...[...Array(8)].map(_ => 'dVp')) // 8 victory points

// Default to standard deck, will be updated based on player count
export const DEVELOPMENT_CARDS_DECK = DEVELOPMENT_CARDS_DECK_STANDARD

export const DC_VICTORY_POINT_CARD_VARIETIES = ['dL', 'dMr', 'dG', 'dC', 'dU']
// dL: 'Library', dMr: 'Market', dG: 'Great Hall', dC: 'Chapel', dU: 'University',

export const LOCS = { CORNER: 'C', EDGE: 'E', TILE: 'T' }

export const PIECES = { S: 'Settlement', C: 'City', R: 'Road' }
export const PIECES_COUNT = { S: 5, C: 4, R: 15 }

export const COST = {
  R: { L: 1, B: 1 },
  S: { L: 1, B: 1, W: 1, S: 1 },
  C: { W: 2, O: 3 },
  DEV_C: { W: 1, S: 1, O: 1 },
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

/** @todo Use this in tile.js, board_shuffler.js (and any other places) */
export const DIR_HELPER = {
  KEYS: { tl: 'top_left', tr: 'top_right', r: 'right', br: 'bottom_right', bl: 'bottom_left', l: 'left' },
  MAPKEYS: { top_left: 'tl', top_right: 'tr', right: 'r', bottom_right: 'br', bottom_left: 'bl', left: 'l' },

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

export const ROLL = _ => Math.ceil(Math.random() * 6)

export const DEFAULT_MAPKEY =
  `S(br_*3).S.S(bl_W2).S
  -S.M10.G2.J9.S(bl_O2)
  -S(r_L2).F12.C6.G4.C10.S
  -S.F9.J11.D.J3.M8.S(l_*3)
  +S(r_B2).J8.M3.F4.G5.S
  +S.C5.F6.G11.S(tl_S2)
  +S(tr_*3).S.S(tl_*3).S`

// 5-6 player board layout based on the official Catan 5-6 player extension
export const DEFAULT_MAPKEY_5_6 =
  `S(br_*3).S.S.S(bl_W2).S
  -S.M10.G2.J9.F6.S(bl_O2)
  -S(r_L2).F12.C6.G4.C10.M3.S
  -S.F9.J11.D.J3.M8.G5.S(l_*3)
  +S(r_B2).J8.M3.F4.G5.C11.S
  +S.C5.F6.G11.J4.S(tl_S2)
  +S(tr_*3).S.S.S(tl_*3).S`

// 7-8 player board layout (custom larger board)
export const DEFAULT_MAPKEY_7_8 =
  `S(br_*3).S.S.S.S(bl_W2).S
  -S.M10.G2.J9.F6.C5.S(bl_O2)
  -S(r_L2).F12.C6.G4.C10.M3.G9.S
  -S.F9.J11.D.J3.M8.G5.F10.S(l_*3)
  -S.G6.F3.M5.C8.J10.F11.J12.S
  +S(r_B2).J8.M3.F4.G5.C11.M12.S
  +S.C5.F6.G11.J4.M2.S(tl_S2)
  +S(tr_*3).S.S.S.S(tl_*3).S`

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
}

export const GAME_STATES = {
  INITIAL_SETUP: 'INITIAL_SETUP',
  // STRATEGIZE: 'strategize',
  // INITIAL_BUILD: 'initial_build',
  // INITIAL_BUILD_2: 'initial_build_2',
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
