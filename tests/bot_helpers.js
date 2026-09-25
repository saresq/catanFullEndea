// Shared by the bot suites. Not a test file: only `*_test.js` is picked up.
import Game from '../models/game.js'
import { attachBots } from '../models/bots/controller.js'
import * as CONST from '../public/js/const.js'
import { until, rollOff } from './helpers.js'

const ST = CONST.GAME_STATES

/** Records `[event, ...args]` for every broadcast. */
export function spyIo(events = []) {
  return { io: { to: () => ({ emit: (...args) => events.push(args) }) }, events }
}

/**
 * A lobby of `humans` humans (seat 1 hosts) then `bots` bot levels, timer off, bots wired with no
 * delay unless `bot_opts` says otherwise.
 */
export function botLobby({ humans = 1, bots = [], config = {}, bot_opts, io = spyIo().io, onGameEnd = () => {} } = {}) {
  const game = new Game({
    id: 'bots', io, onGameEnd, host: { id: 1, name: 'Human 1' },
    config: { player_count: humans + bots.length, timer: false, ...config },
  })
  const controller = attachBots(game, { delay_ms: 0, ...bot_opts })
  for (let i = 2; i <= humans; i++) { game.join('Human ' + i) }
  bots.forEach(level => game.addBot(level))
  return { game, controller }
}

/**
 * Seat 1 wins the roll-off (decided before any bot tick lands), then human seats place at random
 * whenever it is their turn, until the first roll is due.
 */
export async function playSetup(game) {
  if (game.state === ST.FIRST_ROLL) { rollOff(game) }
  await until(() => {
    if (game.state !== ST.INITIAL_SETUP) return true
    const active = game.getActivePlayer()
    if (!active.is_bot && !active.removed) { game.initialBuildIO(active.id) }
  }, 'initial placement to finish')
}

/** Set a hand to exactly `cards`. */
export function setHand(player, cards) {
  const held = Object.fromEntries(Object.keys(CONST.RESOURCES).map(r => [r, player.closed_cards[r]]))
  player.takeCards(held)
  player.giveCards(cards)
}
