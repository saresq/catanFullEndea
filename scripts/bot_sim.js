#!/usr/bin/env node
// Headless bot-vs-bot games: tunes the levels and fuzzes the engine. No server, no port, no
// real-time delays - it drives `Game` directly with a stub `io`, like the tests do.
//
//   npm run sim -- --games 200 --seats medium,medium,easy,easy
//   npm run sim -- --games 50 --players 6 --mapkey "<key from the map editor>"
//
// Exits non-zero when a game throws, a bot errors, a game passes the turn limit or stalls, or an
// evaluator changes the board it was only meant to read.
import Game, { BOT_LEVELS } from '../models/game.js'
import { attachBots } from '../models/bots/controller.js'
import * as CONST from '../public/js/const.js'
import Board from '../public/js/board/board.js'

function parseArgs(argv) {
  const args = { games: 100, seats: 'medium,medium,easy,easy', players: 0, mapkey: '', 'turn-limit': 400, parallel: 25, 'trade-wait': 0, 'bot-trades': 1 }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '')
    if (!(key in args)) { console.error(`unknown option ${argv[i]}`); process.exit(2) }
    args[key] = argv[++i]
  }
  const levels = String(args.seats).split(',').map(s => s.trim()).filter(Boolean)
  const bad = levels.find(l => !BOT_LEVELS.includes(l))
  if (bad || !levels.length) { console.error(`seats must be a list of: ${BOT_LEVELS.join(', ')}`); process.exit(2) }
  const player_count = +args.players || levels.length
  if (player_count < 2 || player_count > 10) { console.error('players must be 2-10'); process.exit(2) }
  // Fewer levels than seats: repeat the pattern
  const seats = Array.from({ length: player_count }, (_, i) => levels[i % levels.length])
  const mapkey = args.mapkey || CONST.mapForPlayers(player_count).mapkey
  if (Board.maxPlayers(mapkey) < player_count) {
    console.error(`that map only seats ${Board.maxPlayers(mapkey)}`); process.exit(2)
  }
  return { games: +args.games || 1, seats, player_count, mapkey, turn_limit: +args['turn-limit'] || 400, parallel: +args.parallel || 25, trade_wait: +args['trade-wait'] || 0, bot_trades: args['bot-trades'] !== '0' && args['bot-trades'] !== 0 }
}

const io = { to: () => ({ emit: () => {} }) }
const failures = []
const fail = (game, what) => failures.push(`${what} - game ${game.id}, turn ${game.turn}, mapkey ${game.config.mapkey}`)

/** Everything an evaluator could change on the board: tiles, robber, pieces - and the card count. */
const boardState = (game, bots) => game.board.generateMapKey() + '|' + game.board.robber_loc + '|'
  + JSON.stringify(game.players.map(p => p.pieces)) + '|' + game.map_changes.length
  + '|' + JSON.stringify([bots?.tracker.known, bots?.tracker.unknown])

function playGame(n, opts) {
  return new Promise(resolve => {
    // Rotate who sits where, so no level keeps the first-player seat
    const seats = opts.seats.map((_, i) => opts.seats[(i + n) % opts.seats.length])
    const game = new Game({
      id: `sim-${n}`, io, host: { id: 1, name: 'Bot 1' }, onGameEnd: () => {},
      config: { player_count: opts.player_count, mapkey: opts.mapkey, timer: false, bot_trades: opts.bot_trades },
    })
    Object.assign(game.getPlayer(1), { is_bot: true, bot_level: seats[0] })
    seats.slice(1).forEach((level, i) => game.join(`Bot ${i + 2}`, { bot_level: level }))
    /** Per level, so a run with two levels tells them apart */
    const per_level = Object.fromEntries(seats.map(l => [l, { ms: 0, n: 0 }]))
    const bots = attachBots(game, {
      delay_ms: 0, needs_humans: false, trade_wait_ms: opts.trade_wait,
      onEvaluate: (run, { pid }) => {
        const before = boardState(game, bots)
        const started = performance.now()
        const intent = run()
        const level = game.getPlayer(pid).bot_level
        per_level[level].ms += performance.now() - started; per_level[level].n++
        if (boardState(game, bots) !== before) { fail(game, 'evaluate changed the board or the card count') }
        return intent
      },
    })
    game.start()

    let last_actions = -1, idle_since = Date.now()
    const watch = setInterval(() => {
      const done = game.state === CONST.GAME_STATES.END
      if (bots.stats.actions !== last_actions) { last_actions = bots.stats.actions; idle_since = Date.now() }
      const stalled = !done && !game.ending && Date.now() - idle_since > 3000
      const overrun = !done && game.turn > opts.turn_limit
      if (!done && !stalled && !overrun) return
      clearInterval(watch)
      clearTimeout(game.end_cleanup_timer)
      if (overrun) { fail(game, `no winner after ${opts.turn_limit} turns`) }
      if (stalled) { fail(game, `stalled in ${game.state} waiting on seat ${game.active_pid}`) }
      game.onAwaiting = null // stops an overrun game from playing on
      resolve({ seats, turns: game.turn, stats: bots.stats, per_level, winner_level: done ? seats[game.end_context.pid - 1] : null })
    }, 5)
  })
}

const opts = parseArgs(process.argv.slice(2))
process.on('uncaughtException', e => {
  console.error('uncaught exception', e)
  process.exit(1)
})
// The engine and the bots log through console; a few thousand games of it buries the report
const quiet = { warn: console.warn, error: console.error }
let logged = 0
console.warn = console.error = () => { logged++ }

const started = Date.now()
const results = []
for (let n = 0; n < opts.games; n += opts.parallel) {
  const batch = Array.from({ length: Math.min(opts.parallel, opts.games - n) }, (_, i) => playGame(n + i, opts))
  results.push(...await Promise.all(batch))
}
Object.assign(console, quiet)

const finished = results.filter(r => r.winner_level)
const sum = key => results.reduce((m, r) => m + r.stats[key], 0)
const seat_share = level => opts.seats.filter(l => l === level).length / opts.seats.length
console.log(`${results.length} games, ${opts.player_count} seats (${opts.seats.join(',')}), ${CONST.mapName(opts.mapkey)} map, ${((Date.now() - started) / 1000).toFixed(1)}s`)
;[...new Set(opts.seats)].forEach(level => {
  const wins = finished.filter(r => r.winner_level === level).length
  const pct = finished.length ? (100 * wins / finished.length).toFixed(1) : '0.0'
  console.log(`  ${level.padEnd(7)} wins ${String(wins).padStart(4)}  ${pct}%  (seat share ${(100 * seat_share(level)).toFixed(0)}%)`)
})
const avg_turns = finished.length ? finished.reduce((m, r) => m + r.turns, 0) / finished.length : 0
console.log(`  average turns ${avg_turns.toFixed(1)}`)
console.log(`  bot errors ${sum('errors')}, fallbacks ${sum('fallbacks')}, demoted to easy ${sum('demoted')}, log lines ${logged}`)
console.log(`  player trades proposed ${sum('proposed')}, accepted ${sum('accepted')}, refused ${sum('refused')}`)
const DECISION_CAP_MS = 5
;[...new Set(opts.seats)].forEach(level => {
  const ms = results.reduce((m, r) => m + r.per_level[level].ms, 0), n = results.reduce((m, r) => m + r.per_level[level].n, 0)
  const avg = n ? ms / n : 0
  console.log(`  ${level.padEnd(7)} decision ${avg.toFixed(3)} ms average over ${n}`)
  if (level === 'tryhard' && avg > DECISION_CAP_MS) { failures.push(`tryhard decisions average ${avg.toFixed(2)} ms, cap ${DECISION_CAP_MS}`) }
})
failures.forEach(f => console.error(`FAILED: ${f}`))
const bad = failures.length || sum('errors')
process.exit(bad ? 1 : 0)
