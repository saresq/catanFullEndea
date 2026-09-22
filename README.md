# Catan
Free to play multiplayer Catan board game

## Links
**Play Game:** [catan.endea.ar](https://catan.endea.ar/login)

> Open the Browser Console to have control over all the game configs, including mapkey

**Map Editor (built-in):**
- Live: https://catan.endea.ar/map-editor
- Local dev: http://localhost:3000/map-editor

**Shuffler & Board builder (legacy site):** [bharathraja.in/catan](https://bharathraja.in/catan)

## Documentation
- [`DEPLOY.md`](DEPLOY.md) — run it locally, environment variables, Docker, the VPS.
- [`WEBSOCKET_ARCHITECTURE.md`](WEBSOCKET_ARCHITECTURE.md) — every socket event, the server state
  machine, end-to-end flows, and the invariants to respect before touching them.
- [`balanced-dice.md`](balanced-dice.md) — the optional balanced-dice algorithm.
- [`TBD.md`](TBD.md) — everything planned, deferred or half-built, and what was decided against.

---

## Play your custom map from the Map Editor
1. Open the Map Editor (see links above).
2. Build or edit your map using the editor UI (or paste a mapkey into the textarea and click Render).
3. Click the “Play this Map” link in the top info area.
   - It will open a new game with your current map, with shuffling disabled.
   - It defaults to 3 players by design, so your custom map won’t be auto-replaced for larger player counts.
4. Enter your name on the login page (if prompted), invite friends, and start the game.

Tips:
- The editor URL always contains your current mapkey. You can copy the URL with the “Copy” button.
- Advanced: You can change the players count by editing the players query param on the /game/new URL before loading it.
- For 7–10 players, the server enforces a preset map to ensure enough tiles, so custom maps for 7–10 are currently not auto-accepted.

## Local Installation & Running
```bash
npm i
npm start     # http://localhost:3000
npm test      # node --test tests/
npm run sim   # headless bot-vs-bot games, no server or port
```
> `.nvmrc` points at node `v20.10`. Use at least `v18`.

Hosting it for other people is in [`DEPLOY.md`](DEPLOY.md).

### Bot simulation
`scripts/bot_sim.js` plays whole games between bots to compare levels and to shake bugs out of the
engine. It exits non-zero on an exception, a bot error, a game that never finishes, or an evaluator
that changes the board.
```bash
npm run sim -- --games 200 --seats medium,medium,easy,easy
npm run sim -- --games 50 --players 6 --mapkey "<key from the map editor>"
```
Bot names come from `config/bot_names.json`, a plain JSON array you can edit.

## Repository map

| Path | What lives there |
|---|---|
| `index.js` | Express routes, Socket.IO server, `GAME_SESSIONS` registry, rematch voting. |
| `models/game.js` | Authoritative game state machine. Every `*IO` method is a socket handler. |
| `models/player.js` | Hand, dev cards, pieces, victory points. |
| `models/io_manager.js` | Binds socket events to `Game` methods; broadcast + private emit helpers. |
| `models/dice.js` | `createDice(mode)` — random or balanced. |
| `models/bots/` | Server-side bots: controller, player view, legal moves, `easy` and `medium` evaluators. |
| `models/rematch.js` | Rematch votes and the next game, bots re-seated. |
| `config/bot_names.json` | Editable list of bot names. |
| `scripts/bot_sim.js` | Headless bot-vs-bot runner (`npm run sim`). |
| `public/js/const.js` | `GAME_CONFIG` defaults and the canonical `SOCKET_EVENTS` table. |
| `public/js/game.js` | Client controller. Renders from broadcasts; never mutates state on its own. |
| `public/js/socket_manager.js` | Client socket listeners and emitters. |
| `public/js/board/` | Board, tile, corner, edge, shuffler. |
| `public/js/ui/` | One module per UI region. |
| `public/css/` | `constants.css` (variables), `base.css`, `index/` per-component files. |
| `public/sounds/`, `public/images/` | Assets. |
| `views/` | Mustache templates: `login`, `waiting_room`, `index`, `map-editor`. |
| `tests/` | `node --test` suites. |

The server is authoritative for everything. Clients send intent, the server validates it, mutates
state and broadcasts the result — see `WEBSOCKET_ARCHITECTURE.md` before adding an event.

## Game states

`PLAYER_ROLL` → active player rolls. A 7 goes to `ROBBER_DROP` (everyone over the hand limit
discards half) then `ROBBER_MOVE` (active player relocates the robber and steals); anything else
distributes resources and goes to `PLAYER_ACTIONS` (build, buy/play dev cards, trade, end turn).
`INITIAL_SETUP` runs first, two snake-order rounds, with the second settlement paying out.

The game ends when a player reaches `config.win_points` — settlements 1, cities 2, victory-point
cards 1 each, largest army 2, longest road 2.

## Game Features
- [x] Design your own map
- [x] 2/3/4/5/6/7/8/9/10 Players
- [x] Build Houses, Roads, and Cities
- [x] Robber Mechanics
- [x] Trade Requests
- [x] Buy and Use Development Cards
- [x] Sounds
- [x] Animations
- [x] Keyboard Shortcuts
- [x] Clear Notification History
- [x] Smart Map Shuffler
- [x] Optional Timer
- [x] Optional Balanced Dice (`config.dice_mode = 'balanced'`)
- [x] Spectators
- [x] Rematch voting at game end

## 5-10 Player Support
The game now supports up to 10 players with the following adjustments:

### 5-6 Players
- Larger board layout with more resource tiles
- Increased development card deck (20 Knights, 9 Progress cards, 6 Victory Points)
- Victory point requirement increased to 11 (configurable)
- Robber hand limit increased to 9 (configurable)

### 7-8 Players
- Even larger board layout with more resource tiles
- Further increased development card deck (24 Knights, 12 Progress cards, 8 Victory Points)
- Victory point requirement increased to 12 (configurable)
- Robber hand limit increased to 11 (configurable)

### 9-10 Players
- Extra Large board layout with many more resource tiles
- Maximum development card deck (30 Knights, 15 Progress cards, 10 Victory Points)
- Victory point requirement increased to 13 (configurable)
- Robber hand limit set to 10 (configurable)

## Frameworks
### Major
  - **[ExpressJS](https://expressjs.com/)** for HTTP server
  - **[Socket.io](https://socket.io/)** for WebSocket radio
  - **[VanillaJS](http://vanilla-js.com/)** for Frontend UI

### Minor Libraries
  - [Mustache](https://mustache.github.io/) for rendering JSON data in HTML
  - [nodemon](https://nodemon.io/) for ease of development
  - [random-words](https://github.com/apostrophecms/random-words) for generating game-keys
  - [cookie-parser](https://github.com/expressjs/cookie-parser) for 🤷🏻‍♂️

## MapKey DSL Explanation
The map is decoded from left-to-right and top-to-bottom. There can by any amount of space `\s` and newline `\n` inbetween the rows and tiles. They are ignored by `.trim()`.

#### Board
The board consists of `<Rows>` separated by  a `-` (bottom-left) or `+` (bottom-right) representing its tile-relationship to the previous row.
```js
<Row> ([+|-] <Row>)*
```

#### Row
A `<Row>` consists of one or more `<Tile>` separated by dot `.`.
```js
<Tile> (. <Tile>)*
```
There are two types of Tiles - Resource and Sea.

#### Resource Tile
A Resource tile is represented by its key `<TileKey>` and a number `<Number>` next to it.
```js
<TileKey><Number>
```
```js
// Accepted values:
const TileKey = { G: 'Grassland', J: 'Jungle', C: 'Clay Pit', M: 'Mountain', F: 'Fields', S: 'Sea', D: 'Desert' }
const Number = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]
```

#### Sea Tile
A Sea tile is represented by `S` and can optionally have one trade.
```js
S<Trade>?
```

#### Trade
A `Trade` is represented by its edge of the Sea tile it's on `<tEdge>`, type `<tType>` and a number `<tRatio>` covered by round braces `()` and split by underscore `_`.
```js
(<tEdge>_<tType><tRatio>)
```
```js
// Accepted values:
const tEdge = {
  tl: 'top_left',     tr: 'top_right',
  l: 'left',                                        r: 'right',
              bl: 'bottom_left',  br: 'bottom_right',
}

const tType = { '*': 'All', S: 'Sheep', L: 'Lumber', B: 'Brick', O: 'Ore', W: 'Wheat' }

const tRatio = [2, 3]

// Example: (tr_W3)
```
#### General Note
- Surrounding your land with the sea is not necessary, but recommended to get the beautiful sea shores.
- The robber will be placed in the last desert found during decoding.

### Example
This configuration…
```js
const config = {
  mapkey: `
                        S  .S(bl_O2)    .S(br_O2)    .S
                      -S .M8         .D          .M8   .S
                    -S .G9    .S           .S       .G9  .S
                  -S .F10 .S         .S          .S    .F10.S
                -S  .S .C11   .S           .S       .C12 .S  .S
              -S  .S .S   .C2        .S          .C3   .S  .S  .S
        -S(r_L2).J6.J5 .J4    .S           .S       .J4  .J5 .J6 .S(l_L2)
              +S  .S .S   .S         .S          .S    .S  .S  .S
  `
}
// Same as writing…
config.mapkey = `S.S(bl_O2).S(br_O2).S-S.M8.D.M8.S-S.G9.S.S.G9.S-S.F10.S.S.S.F10.S-S.S.C11.S.S.C12.S.S-S.S.S.C2.S.C3.S.S.S-S(r_L2).J6.J5.J4.S.S.J4.J5.J6.S(l_L2)+S.S.S.S.S.S.S.S.S`
```
Renders the map…
<img width="900" alt="Screenshot 2024-02-04 at 11 46 20 copy" src="https://github.com/bigomega/catan/assets/2320747/7449040b-2f77-4ba1-beeb-a648af4dea05">
