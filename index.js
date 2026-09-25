import path from 'path'
import { fileURLToPath } from 'url'
import { parse as parseCookie } from "cookie"
import http from "http"
import express from 'express'
import { Server } from "socket.io"
import mustacheExpress from 'mustache-express'
import cookieParser from 'cookie-parser'
import { generate as generateRandomWords } from "random-words"
import Game from "./models/game.js"
import Player from "./models/player.js"
import { attachBots } from "./models/bots/controller.js"
import { rematchNonVoters, createRematch } from "./models/rematch.js"
import * as CONST from "./public/js/const.js"
import { t, DICT, LOCALE } from "./public/js/i18n.js"
import Board from "./public/js/board/board.js"

const app = express()
const PORT = process.env.PORT || 3000
const server = http.createServer(app)
const io = new Server(server)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Static files: always revalidate (cheap 304s on the ETag), so a deploy reaches every phone the
// next time it opens the page. Cloudflare's Browser Cache TTL overrides `max-age=0` but honours
// `no-cache`; images and sounds never change under the same name, so they may be kept.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true, lastModified: true,
  setHeaders: (res, file) => {
    res.set('Cache-Control', /\.(png|webp|jpg|mp3|woff2?)$/.test(file) ? 'public, max-age=86400' : 'no-cache')
  },
}))
// Rendered pages carry game state: never cached, never restored from a stale copy
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
app.use(cookieParser())
app.engine('html', mustacheExpress())
app.set('view engine', 'html')
app.set('views', __dirname + '/views')

/** Every view gets the dictionary and the document language. */
const render = (res, view, locals = {}) => res.render(view, { t: DICT, lang: LOCALE, ...locals })

app.get('/map-editor', (req, res) => {
  render(res, 'map-editor')
})

const SESSION_EXPIRE_HOURS = 5
const API_SALT = process.env.API_SALT
if (!API_SALT) { console.warn('API_SALT not set - /api/sessions routes are disabled') }
/** Fails closed: no salt configured means no access. */
function apiAuthorized(req) { return !!API_SALT && req.query.salt === API_SALT }
/** @todo Move to a db for game state maintenance? */
/** @type {Object.<string, Game>} */
const GAME_SESSIONS = {}

/** JSON for a `<script>` block: no `<`, so a value can never close the block. */
const toScript = v => JSON.stringify(v).replace(/</g, '\\u003c')

function onGameEnd(id) {
  delete GAME_SESSIONS[id]
}

app.get('/', function (req, res) {
  const game_id = (req.cookies.game_id || '').toLowerCase()
  if (game_id && GAME_SESSIONS[game_id]) {
    res.redirect('/game/' + game_id)
  } else {
    res.redirect('/login')
  }
})

app.get('/game/new', function (req, res) {
  let id
  do { id = generateRandomWords({ min: 2, max: 2, join: '-' }) } while (GAME_SESSIONS[id])
  const { name, players = CONST.GAME_CONFIG.player_count, config: query_config } = req.query
  if (+players < 2 || +players > 10) { return res.redirect('/login?notice=' + encodeURIComponent(t('notice.player_count'))) }
  let config = Object.assign({}, CONST.GAME_CONFIG, { player_count: +players || 2 })
  try { config = Object.assign(config, JSON.parse(decodeURIComponent(query_config))) } catch(e){}
  
  // Honour a provided mapkey when it seats everyone, otherwise size the map to the player count.
  const provided_config = (() => { try { return JSON.parse(decodeURIComponent(query_config)) } catch(e) { return {} } })()
  config.mapkey = provided_config.mapkey && CONST.mapFitsPlayers(provided_config.mapkey, config.player_count)
    ? provided_config.mapkey
    : CONST.mapForPlayers(config.player_count).mapkey
  config.map_size = CONST.mapId(config.mapkey)

  // A hand-made map can be too small to seat everyone. Say so here instead of letting the
  // initial placement run out of corners mid-game.
  const seats = Board.maxPlayers(config.mapkey)
  if (config.player_count > seats) {
    return res.redirect(`/login?notice=${encodeURIComponent(t.plural('notice.map_seats', seats))}`)
  }

  // Presets always shuffle everything; a hand-made map keeps the editor's "keep my layout" options.
  // The shuffle itself happens once, in `Game.start()`, after the lobby has settled on a map.
  config.map_shuffle = CONST.shuffleTypeFor(config)
  const pid = 1
  const game = new Game({
    id, io,
    host: { name, id: pid },
    config,
    onGameEnd: _id => onGameEnd(_id),
  })
  attachBots(game)
  res.cookie('game_id', id, { maxAge: SESSION_EXPIRE_HOURS * 60 * 60 * 1000, httpOnly: true })
  res.cookie('player_id', pid, { maxAge: SESSION_EXPIRE_HOURS * 60 * 60 * 1000, httpOnly: true })
  GAME_SESSIONS[id] = game
  // res.send(`<script>window.location.href = "/game/${id}"</script>`)
  res.redirect('/game/' + id)
})

app.get('/game/:id', function(req, res) {
  const game_id = (req.params.id || '').toLowerCase()
  if (!game_id || game_id !== (req.cookies.game_id || '').toLowerCase() || !GAME_SESSIONS[game_id]) {
    // If user comes via a shared link without cookies or game not in session,
    // take them to login with the game_id prefilled instead of showing an error.
    return res.redirect(`/login?game_id=${encodeURIComponent(game_id || '')}`)
  }
  const game = GAME_SESSIONS[game_id]
  const player_id = +req.cookies.player_id
  if (player_id !== 0 && (!player_id || !game.hasPlayer(player_id))) {
    return res.redirect(`/login?game_id=${encodeURIComponent(game_id)}`)
  }
  if (!game.state) {
    const pc = game.player_count
    // The preset id is fixed before shuffling; shuffled keys no longer match a preset
    const map_size = game.config.map_size || CONST.mapId(game.config.mapkey)

    render(res, 'waiting_room', {
      players: toScript(game.players),
      player_count: +pc || 0,
      game_key: game_id,
      copy_invite_aria: t('lobby.copy_invite_aria', { key: game_id }),
      game_id: toScript(game_id || null),
      win_points: +game.config.win_points || 0,
      map_size: toScript(map_size || null),
      mapkey: toScript(game.config.mapkey || null),
      dice_mode: toScript(game.config.dice_mode || 'random'),
      my_pid: toScript(+req.cookies.player_id),
      host_pid: toScript(game.host_pid ?? null),
      spectators_count: +game.spectators_count || 0,
    })
    return
  }
  if (player_id === 0) {
    if (!req.cookies.spectator_id) {
      const specId = Math.random().toString(36).substring(2)
      res.cookie('spectator_id', specId, { maxAge: SESSION_EXPIRE_HOURS * 60 * 60 * 1000, httpOnly: true })
    }
    return render(res, 'index', {
      game: toScript(game),
      player: toScript({ id: 0, name: t('notice.spectator'), spectator: true }),
      opponents: toScript(game.players.filter(p => p && !p.removed).map(_ => _.toJSON())),
    })
  }
  const player = game.getPlayer(player_id)
  render(res, 'index', {
    game: toScript(game),
    player: toScript(player.toJSON(1)),
    opponents: toScript(game.getOpponents(player.id).map(_ => _.toJSON())),
  })
})

app.get('/login', function (req, res) {
  const { name, notice } = req.query
  const game_id = (req.query.game_id || '').toLowerCase()
  res.clearCookie('game_id')
  res.clearCookie('player_id')
  if (notice) { return render(res, 'login', { notice }) }
  if (!game_id) { return render(res, 'login') }
  if (!GAME_SESSIONS[game_id]) {
    // A join attempt (name and key) with a key that matches no game: back to the form, which says
    // so. A bare key (old invite link, server restart) shows the form without an error.
    if (name && req.query.not_found !== '1') {
      return res.redirect(`/login?name=${encodeURIComponent(name)}&game_id=${encodeURIComponent(game_id)}&not_found=1`)
    }
    return render(res, 'login')
  }

  // Joining a game (or reclaiming an existing slot by name)
  const game = GAME_SESSIONS[game_id]
  if (req.query.spectate === '1') {
    res.cookie('game_id', game.id, { maxAge: SESSION_EXPIRE_HOURS * 60 * 60 * 1000, httpOnly: true })
    res.cookie('player_id', 0, { maxAge: SESSION_EXPIRE_HOURS * 60 * 60 * 1000, httpOnly: true })
    if (!req.cookies.spectator_id) {
      const specId = Math.random().toString(36).substring(2)
      res.cookie('spectator_id', specId, { maxAge: SESSION_EXPIRE_HOURS * 60 * 60 * 1000, httpOnly: true })
    }
    return res.redirect(`/game/${game.id}`)
  }

  // Require a non-empty name to join; otherwise show the login page (Join tab UI will guide the user)
  const trimmedName = Player.cleanName(name)
  if (!trimmedName) {
    return render(res, 'login')
  }

  // A bot's seat is never handed over by name
  let player = game.findSeatByName(trimmedName)
  if (!player) {
    player = game.join(trimmedName)
  }

  if (!player) {
    return res.redirect(`/login?game_id=${game_id}&full=1`)
  }

  res.cookie('game_id', game.id, { maxAge: SESSION_EXPIRE_HOURS * 60 * 60 * 1000, httpOnly: true })
  res.cookie('player_id', player.id, { maxAge: SESSION_EXPIRE_HOURS * 60 * 60 * 1000, httpOnly: true })
  res.redirect(`/game/${game.id}`)
})

app.get('/logout', function (req, res) {
  const game_id = (req.cookies.game_id || '').toLowerCase()
  const player_id = req.cookies.player_id
  if (game_id && player_id && GAME_SESSIONS[game_id]?.hasPlayer(+player_id)) {
    GAME_SESSIONS[game_id].removePlayer(+player_id)
  }
  res.clearCookie('game_id')
  res.clearCookie('player_id')
  res.redirect('/login')
})

app.get('/api/sessions', function (req, res) {
  if (!apiAuthorized(req)) return res.status(401).json({})
  const loggable_json = JSON.parse(JSON.stringify(GAME_SESSIONS))
  res.json(loggable_json)
})

app.get('/api/sessions/clear/:id?', function(req, res) {
  if (!apiAuthorized(req)) return res.status(401).json({})
  if (req.params.id) {
    delete GAME_SESSIONS[req.params.id]
    return res.redirect('/api/sessions?salt=' + encodeURIComponent(req.query.salt))
  }
  Object.keys(GAME_SESSIONS).forEach(gid => delete GAME_SESSIONS[gid])
  res.redirect('/api/sessions?salt=' + encodeURIComponent(req.query.salt))
})

const REMATCH_INFO = {}
const SOCK_INFO = {}
io.on('connection', (socket) => {
  let { game_id, player_id, spectator_id } = parseCookie(socket.handshake.headers.cookie || '')
  game_id = (game_id || '').toLowerCase()
  player_id = +player_id
  socket.join(game_id || -1)
  // Only setup socket events for the correct game
  if (player_id === 0) {
    GAME_SESSIONS[game_id]?.addSpectator(socket, spectator_id)
  } else {
    GAME_SESSIONS[game_id]?.setUpPlayerSocket(player_id, socket)
  }
  SOCK_INFO[socket.id] = { game_id, player_id, spectator_id }

  // Handle Rematch Vote
  socket.on(CONST.SOCKET_EVENTS.REMATCH_VOTE, () => {
    const info = SOCK_INFO[socket.id]
    const gid = info?.game_id
    const pid = info?.player_id
    const game = GAME_SESSIONS[gid]
    if (!gid || !pid || !game) return

    // Initialize vote tracking for this game if needed
    if (!REMATCH_INFO[gid]) {
      REMATCH_INFO[gid] = { votes: new Set() }
    }

    REMATCH_INFO[gid].votes.add(pid)

    // Bots count as voted; quit seats have no vote
    const nonVoters = rematchNonVoters(game, REMATCH_INFO[gid].votes)

    if (nonVoters.length === 0) {
      // Unanimous: a new game with the same configuration, host and bots
      let newId
      do { newId = generateRandomWords({ min: 2, max: 2, join: '-' }) } while (GAME_SESSIONS[newId])

      const { game: newGame, redirects: redirectMap } = createRematch(game, {
        id: newId, io, onGameEnd: _id => onGameEnd(_id),
      })
      GAME_SESSIONS[newId] = newGame

      io.to(gid).emit(CONST.SOCKET_EVENTS.REMATCH_NEW_GAME, redirectMap)

      // Cleanup old session tracking
      delete REMATCH_INFO[gid]
      onGameEnd(gid)
    } else {
      io.to(gid).emit(CONST.SOCKET_EVENTS.REMATCH_PROGRESS, nonVoters.map(p => p.name))
    }
  })

  socket.on('disconnect', () => {
    const info = SOCK_INFO[socket.id]
    if (!info) return
    const { game_id, player_id, spectator_id } = info
    if (player_id === 0) {
      GAME_SESSIONS[game_id]?.removeSpectator(socket, spectator_id)
    } else {
      GAME_SESSIONS[game_id]?.removePlayerSocket(player_id, socket)
    }
    delete SOCK_INFO[socket.id]
  })
})

server.listen(PORT, function() {
  console.log(`Server running at http://localhost:${PORT}`)
})
