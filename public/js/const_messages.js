import * as CONST from "./const.js"
import { t } from "./i18n.js"

// The name sits in its own span so the status bar can hide it on phones without zeroing the
// font size of `.p-name` - the hexagon `::before` aligns against those metrics.
export const getName = player => player ? `<span class="p-name pc${player.color_id || player.id}"><span class="p-name-text">${player.name}</span></span>` : `<span class="p-name me">${t('log.you')}</span>`

export const resToText = obj => Object.keys(obj).filter(k => obj[k])
  .map(k => `<span class="res-count" data-count="${obj[k]}">${obj[k]}</span><div class="res-icon ${k}"></div>`).join('')

export const resToIcons = obj => Object.keys(obj).filter(k => obj[k])
  .map(k => Array(obj[k]).fill(`<div class="res-icon ${k}"></div>`).join('')).join('')

const resIcon = res => `<div class="res-icon ${res}"></div>`

/** `log.<key>` for another player, `log.<key>_self` when `p` is null (the viewer), with `{name}` filled. */
const line = (key, p, vars) => t(p ? `log.${key}` : `log.${key}_self`, { name: getName(p), ...vars })

// Every line is a whole sentence in the dictionary (`log.*`); the functions only fill the names,
// numbers and icons in. Word order, plurals and articles are the locale's business.
const GAME_MESSAGES = {
  STRATEGIZE: { all: time => t('log.strategize', { t: time }) },
  INITIAL_BUILD: {
    self: _ => t('log.initial_build_self'),
    other: p => t('log.initial_build_other', { name: getName(p) }),
  },
  INITIAL_BUILD_2: {
    self: _ => t('log.initial_build_2_self'),
    other: p => t('log.initial_build_2_other', { name: getName(p) }),
  },
  ROLL_TURN: {
    self: _ => t('log.roll_turn_self'),
    other: p => t('log.roll_turn_other', { name: getName(p) }),
  },
  SPECIAL_BUILD: { all: p => line('special_build', p) },
  DICE_VALUE: {
    all: (n, m, p, res) => line('dice_value', p, {
      total: n + m, d1: n, d2: m,
      blocking: res ? t('log.dice_blocking', { icon: resIcon(res) }) : '',
    }),
  },
  RES_TAKEN: {
    all: res_obj => {
      if (!Object.keys(res_obj).length) { return '' }
      return t('log.res_taken', { res: resToText(res_obj) })
    }
  },
  BUILDING: { all: (piece, p) => line('building', p, { piece: t(`names.pieces.${piece}.with_article`) }) },
  DEVELOPMENT_CARD_BUY: {
    all: (p, c) => line('dev_card_buy', p, {
      card: c ? t('log.dev_card_buy_card', { card: CONST.DEVELOPMENT_CARDS[c] }) : '',
    }),
  },
  DEVELOPMENT_CARD_USE: {
    self: d => t('log.dev_card_use_self', { card: CONST.DEVELOPMENT_CARDS[d] }),
    other: (d, p) => t('log.dev_card_use_other', { name: getName(p), card: CONST.DEVELOPMENT_CARDS[d] }),
  },
  KNIGHT: {
    self: _ => t('log.knight_self'),
    other: p => t('log.knight_other', { name: getName(p) }),
  },
  ROBBER: {
    self: drop_count => t('log.robber_self', { n: drop_count }),
    other: _ => t('log.robber_other'),
  },
  ROBBER_MOVE: {
    self: _ => t('log.robber_move_self'),
    other: p => t('log.robber_move_other', { name: getName(p) }),
  },
  ROBBER_MOVED_TILE: {
    all: (tile, num, p) => {
      const icon = CONST.TILE_RES[tile] ? resIcon(CONST.TILE_RES[tile]) : CONST.TILE_EMOJIS[tile]
      return line('robber_moved_tile', p, { icon, tile: CONST.TILES[tile], num })
    },
  },
  /** `p1` stole from `p2`; the viewer always learns what they stole themselves */
  PLAYER_STOLE_RES: {
    all: (p1, p2, res) => res
      ? t(p1 ? 'log.stole_res_known' : 'log.stole_res_known_self', { icon: resIcon(res), name: getName(p2) })
      : t('log.stole_res_unknown', { name: getName(p2) }),
  },
  PLAYER_TRADE_INFO: {
    all: ({ p1, p2, board }, given, taken) => t(p1 ? 'log.trade_info' : 'log.trade_info_self', {
      p1: getName(p1), p2: board ? t('log.the_board') : getName(p2),
      given: resToText(given), taken: resToText(taken),
    }),
  },
  KNIGHT_USED_APPEND: { all: _ => t('log.knight_used_append') },
  ROAD_BUILDING_USED: { all: p => line('road_building_used', p) },
  MONOPOLY_USED: {
    all: (p, res, total, self_c) => total
      ? line('monopoly_used', p, {
        res: resToText({ [res]: total }),
        from_you: p ? t('log.monopoly_from_you', { n: self_c }) : '',
      })
      : line('monopoly_used_nothing', p),
  },
  YEAR_OF_PLENTY_USED: {
    all: (p, res_obj) => p
      ? t('log.year_of_plenty_used_other', { name: getName(p) })
      : t('log.year_of_plenty_used_self', { name: getName(p), res: resToText(res_obj) }),
  },
  LARGEST_ARMY: { all: (p, c) => line('largest_army', p, { n: c }) },
  LONGEST_ROAD: { all: (p, l) => line('longest_road', p, { n: l }) },
  PLAYER_QUIT: {
    all: (p, replace_pid) => t('log.player_quit', { name: getName(p) })
      + (replace_pid ? `<div class="quit-actions"><button type="button" class="btn btn--primary btn--sm replace-bot" data-pid="${replace_pid}">${t('log.replace_with_bot')}</button></div>` : ''),
  },
  SEAT_TAKEN_OVER: { all: (p, was) => t('log.seat_taken_over', { name: getName(p), was }) },
  HOST_CHANGED: { all: (p, me) => me ? t('log.host_changed_self') : t('log.host_changed_other', { name: getName(p) }) },
  END_STATUS: { all: (p, pt) => line('end_status', p, { points: pt }) },
}

export default GAME_MESSAGES
