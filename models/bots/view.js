const clone = v => v === undefined ? v : JSON.parse(JSON.stringify(v))

/**
 * What the player at seat `pid` can know: public information plus their own hand. Evaluators get
 * this and nothing else, so a bot cannot peek at another hand or at the development deck even by
 * accident. Everything is a copy except `board`, which is the live instance shared READ-ONLY
 * (cloning it per decision is the expensive part); the simulator asserts evaluators leave it alone.
 *
 * @param {import('../game.js').default} game
 * @param {number} pid
 */
export function buildView(game, pid) {
  const me = game.getPlayer(pid)
  return {
    pid,
    me: clone(me.toJSON(1)),
    players: game.players.filter(p => p?.id).map(p => clone(p.toJSON())),
    board: game.board,
    state: game.state,
    turn: game.turn,
    active_pid: game.active_pid,
    dice_value: clone(game.dice_value),
    robber_loc: game.board?.robber_loc,
    dev_cards_len: game.dev_cards.length,
    largest_army_pid: game.largest_army_pid,
    longest_road_pid: game.longest_road_pid,
    ongoing_trades: clone(game.ongoing_trades),
    /** The resource supply, public to every seat */
    bank: clone(game.bank),
    config: clone(game.config),
  }
}
