import Game from "./game.js"
import { attachBots } from "./bots/controller.js"

/** Players whose rematch vote is still needed: bots always want one, quit seats have no say. */
export function rematchNonVoters(game, votes) {
  return game.players.filter(p => p && !p.removed && !p.is_bot && !votes.has(p.id))
}

/**
 * The next game for the same table: same config and host, every bot seat (taken-over ones
 * included) seated again at its level. Bots sit down before anyone is redirected, so the room a
 * human arrives in already holds them. Humans rejoin by name.
 *
 * @returns {{ game: Game, redirects: Object<number, string> }}
 */
export function createRematch(old_game, { id, io, onGameEnd, bot_opts }) {
  const players = old_game.players.filter(p => p && !p.removed)
  const humans = players.filter(p => !p.is_bot)
  const host = old_game.getPlayer(old_game.host_pid)
  const game = new Game({
    id, io, onGameEnd,
    host: { name: host?.name, id: old_game.host_pid },
    config: JSON.parse(JSON.stringify(old_game.config || {})),
  })
  attachBots(game, bot_opts)
  // A re-drawn bot name must not take a returning human's name
  const avoid_names = humans.map(p => p.name)
  players.filter(p => p.is_bot).forEach(bot => game.addBot(bot.bot_level, { avoid_names }))

  const redirects = Object.fromEntries(humans.map(p =>
    [p.id, `/login?game_id=${encodeURIComponent(id)}&name=${encodeURIComponent(p.name)}`]))
  return { game, redirects }
}
