// Shared test helpers. Not a test file: `node --test` only picks up `*_test.js` here, so this is
// never run on its own.

/**
 * Wait for a condition instead of guessing how long it takes. `Game` defers several things on
 * timers (the end of a game by 200ms, every turn by the turn timer), and a fixed sleep sized just
 * over the delay turns into a flaky test the moment the machine is busy - `node --test` runs the
 * files in parallel, so that happens on an ordinary run. Polling passes as soon as the state is
 * there, which is both faster and load-proof.
 *
 * @param {() => any} check   truthy when the wait is over; its value is returned
 * @param {string} label      what is being waited for, for the timeout message
 * @param {number} timeout_ms give up after this long (a real failure, not a slow machine)
 */
export async function until(check, label = 'a condition', timeout_ms = 5000) {
  const deadline = Date.now() + timeout_ms
  for (;;) {
    const value = check()
    if (value) return value
    if (Date.now() >= deadline) {
      throw new Error(`timed out after ${timeout_ms}ms waiting for ${label}`)
    }
    await new Promise(r => setTimeout(r, 2))
  }
}

/** Let pending timers run. Only for proving something does *not* happen. */
export const tick = ms => new Promise(r => setTimeout(r, ms))

/**
 * The roll for first player, decided: `first` rolls a 12 and everyone else a 2, so the tests
 * that count seats from 1 keep doing so. Timer off, so nothing rolls on its own.
 */
export function rollOff(game, first = 1) {
  const dice = game.dice
  game.players.filter(p => p?.id).forEach(p => {
    game.dice = { roll: () => p.id === first ? { d1: 6, d2: 6 } : { d1: 1, d2: 1 } }
    game.playerRollIO(p.id)
  })
  game.dice = dice
}

/** Start the game with `first` playing first and every seat placed at random, to the first roll. */
export function playToFirstRoll(game, first = 1) {
  game.start()
  rollOff(game, first)
  let guard = 0
  while (game.state === 'INITIAL_SETUP' && guard++ < 40) { game.initialBuildIO(game.active_pid) }
}
