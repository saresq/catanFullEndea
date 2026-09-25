# TBD

Every piece of work that is planned, deferred or half-built, in one place. Nothing here is in
progress.

Ordered by value / risk, most worth doing first. Each entry says what is wrong, how it is known, and
what a fix takes, so nobody has to re-derive it.

**Context — what already ships:** board rendering and the mapkey decoder, login and waiting room, the
full turn loop (roll, build, trade, dev cards, robber, longest road, largest army), animations and
sounds, keyboard shortcuts, accessibility controls, alert history, end game and rematch voting, the
map editor, spectators, and the optional balanced dice. Roughly Jun '23 → 2026; the per-month tick
list it used to live in is in the git history.

---

## 1. Security

### 1.1 Cookie identity is unauthenticated (`game_id` / `player_id`) — highest value

**Found:** 2026-09-17, while fixing the `/api/sessions/clear` auth bypass (`fd2696c`).
**Severity:** medium. One game per request, and the attacker needs the game id.

`game_id` and `player_id` are plain client-set cookies with no signature and no server-side session.
Any route or socket handler that trusts them trusts the client.

Two confirmed consequences:

- `index.js` `/logout` — `GAME_SESSIONS[game_id]?.hasPlayer(+player_id)` only checks that the player
  slot is occupied, not that the caller owns it. Forged cookies remove that player; if they are the
  host in the waiting room (or the last player), `removePlayer` calls `onGameEnd` and the game is
  deleted.
- `index.js` socket connect — `setUpPlayerSocket(player_id, socket)` takes the cookie pid straight,
  so forged cookies attach to another player's socket and can act as them.

Verified against a local server: a client with no connection to the game sent
`Cookie: game_id=<victim>; player_id=1` to `/logout`, got `302`, and the session was gone.

```
sessions before: ['black-attempt']
sessions after:  []
```

Scope limits: ids come from `random-words` two-word pairs and `/api/sessions` no longer leaks the
list, but ids are shared openly in invite links — anyone who has seen a link can kill that game.

**Fix shape:** issue an unguessable per-player token at join, store it on the `Game`, and check it in
`/logout` and on socket connect instead of trusting the pid. Keep the pid for game logic; the token is
only for "is this really that player". Touches join, the cookie writes, `/logout`, the socket connect
block, and `hasPlayer` call sites — bigger than a one-line change, which is why it was left out of the
`fd2696c` security commit.

### 1.2 `SAVE_STATUS` stores client text verbatim

`models/game.js` stores the status string as sent and `public/js/ui/alert_ui.js` writes it with
`innerHTML`; it is also unguarded against an unknown `pid`. Documented as an invariant in
[`WEBSOCKET_ARCHITECTURE.md`](WEBSOCKET_ARCHITECTURE.md) §"Invariants" — treat as untrusted before
widening its use. A fix is either escaping on render or validating on receipt.

---

## 2. Half-built features (code exists, path is dead)

- **Counter a trade request.** Rules settled 2026-09-17 (below); not built. The `@todo` in
  `public/js/ui/trade_ui.js` is misleading: `tradeRequestIO` takes a `counter_id` argument and **never
  reads it**, and its first line is `#canAct(pid)` = `isActive(pid) && state === PLAYER_ACTIONS`, so a
  counter — which by definition comes from a player whose turn it is not — is refused before
  `counter_id` could matter. `.counter` is also `display: none` in CSS with no `.active` override, so
  the button has never been visible in any state.

  **Rules, decided:**

  - A counter does **not** close the original. Other players can still accept it; the countering
    player is implicitly out of it, so their pid is added to the original's `rejected[]`. (If every
    opponent counters, the original flips to `failed` on its own — correct.)
  - **One counter per original request per player.** A second counter to the same request replaces
    the first (mark the old one `deleted`). Counters do not spend the active player's
    `max_trade_requests` budget, which is per-requester and stays as it is.
  - **Only the active player** — the one the counter was aimed at — may accept it. Other non-active
    players see it but cannot take it; that would be trading on someone else's turn.
  - **No chains.** A counter is a leaf: accept or ignore. To change terms the active player posts a
    new request. Bounds the model to depth 1.
  - **No turn-timer bonus.** `#extendTurnTimeOnFirstTrade` stays a reward for the turn holder;
    opponents must not be able to stretch a turn they do not own.
  - Composing a counter **reuses the Px card-selection panel**, opened with `#counter_id` set and
    seeded swapped from the original (giving ← its `asking`, taking ← its `giving`), then freely
    edited. One code path, and it already validates against the composer's own hand.

  **Implementation shape:**

  - `models/game.js` `tradeRequestIO` — a counter branch ahead of `#canAct`: require
    `state === PLAYER_ACTIONS`, a referenced trade that is `open` and owned by `active_pid`, and
    `pid !== active_pid`; then the same resource validation as a normal `Px` request. Push
    `{ …, counter_of: counter_id }`, delete this player's previous counter to that request, push their
    pid onto the original's `rejected[]`, emit `requestPlayerTrade` + `updateOngoingTrades`.
  - `models/game.js` `tradeResponseIO` — when the trade has a `counter_of`, require `#isActive(pid)`
    on the accept path. Withdrawal needs nothing new: the author is `trading_pid`, so the existing
    `pid === trading_pid` branch already deletes it for free.
  - `public/js/ui/trade_ui.js` — Counter button opens the card selection with `#counter_id` and the
    seeded resources; `renderNewRequest` renders a counter as a request card, and `updateOngoing` must
    only put `.active` on its Accept when this client is the active player.
  - `public/css/index/trade.css` — give `.counter` a visible state (and `.active`), and a look that
    distinguishes a counter row from a plain request.

- **End-game stats tab is a stub.** `public/js/ui/alert_ui.js` renders a tab labelled `Stats (WIP)`
  whose body reads "More detailed stats coming soon...".
- **No message when a trade offer is rejected.** The state is tracked (`rejected[]`,
  `status: 'failed'` in `models/game.js`) and the ongoing-trades panel updates (`trade_ui.js`), but
  nothing is written to the alert line the way a completed trade is.

---

## 3. Known gaps and small bugs

- **Touch targets below 44px outside the trade zone.** Measured in-game at 390px on 2026-09-18; the
  trade zone was fixed, these were not: `button.trade` 39×19, the four action-bar buttons
  (`build-road`, `build-settlement`, `build-city`, `dev-card`) 60×36, `button.close` 23×23,
  `button.toggle-players` 22×19, `settings-gear` and `status-bar-history` 30×30 each. Enlarging them
  means touching the action bar's layout, which is where the load-bearing tail-override sections live
  (§6) — worth its own pass, not a drive-by.
- **Trade amounts are low-contrast.** `.giving` / `.asking` in a request card draw their count at
  12px in `#0006` on a pale pill (`index/trade.css`), so "give 1" and "give 3" are hard to tell apart
  at arm's length. Desktop and mobile both.
- **Macondo is not redeclared in `map-editor.css`**, so `--font-heading` falls back to `cursive` in
  the editor's info panel. Found while reviewing the deliberate `@font-face` duplication (§6).
- **Numberless tiles in the mapkey** — let a tile declare no number and have the game fill it. Not
  implemented; the decoder requires a number on every resource tile.
- **Generic resource tiles in the mapkey** — same idea for the resource itself.
- **Timer gives no warning in its last seconds** (`public/js/ui/player_ui.js`) — no colour or focus
  change.
- **Login splash image is not preloaded**, so the first paint can flash.
- **Development card styling breaks in Safari.** Unverified since it was reported.
- **7-10 player custom maps** are replaced by a preset; the editor's "Play this Map" defaults to 3
  players for that reason.

### 3.1 A board nobody can build on never ends the game

**Found:** 2026-09-18, designing the abandoned-game reaper (`5865429`). **Severity:** low, and hand-made maps
only. Designed in full, deliberately not built — the numbers below say why.

`models/game.js` `#onPlayerVpChange` is the only path to `END`, and it returns early unless someone
reaches `win_points`. On a small hand-made map the board can run out: every corner taken or blocked,
every legal edge built, dev deck empty. No VP can change again, so the turn timer cycles between
live players forever and the game can never be finished. Official Catan has no stalemate rule
because a boxed board cannot reach the state; the map editor can.

**Why it is not built.** A soak fired the predicate 0/25 times on the preset map and 6/25 on a tiny
hand-made one. It also cannot fix the "server loops forever" symptom it was proposed for: the
predicate needs an empty dev deck, and timer auto-advance never buys a card, so an abandoned game
always has a full deck. That was the abandoned-game reaper, and it is fixed (`5865429`). It is worth
~40 lines only because a five-tile hand-made map has already crashed the server once (`Board.maxPlayers`,
2026-09-17), so tiny maps are a real thing users make and this is the second way they wedge.

**Seen again 2026-09-25, at ten seats.** Bot-only games on the `xlarge` preset (52 hexes, target 13)
ran 400 rounds without a winner in 6 of 6 tries, before and after `align-official-rules`: every
seat ends with its two initial corners upgraded to cities, no settlement spot left and the deck
empty, so nobody gets past 10. Eight seats finished 2 of 6, six seats 6 of 6. The same board
exhaustion, on a preset; `tests/bot_paired_test.js` therefore runs its ten-seat games for thirty
rounds and asserts no stall, not a winner.

**Decided: one winner, not a draw.** The end screen hardcodes a single winner
(`public/js/game.js:328`, `public/js/ui/alert_ui.js:193`) and a real multi-winner screen is 40-60
lines of markup and CSS. Highest VP, then most cities, then most settlements, then lowest pid. But
ties are the *normal* case here, not the edge case — a three-way 4-4-4 on a symmetric tiny map was
confirmed, and turn order broke every one of 60 sampled stalemates — so the alert has to say so
rather than claim a clean win.

**Decided: the knight clause tests reachability**, it does not just check for a held card. A bare
`!p.closed_cards.dK` blocks the stalemate forever whenever anyone sits on an unplayed knight, which
on an exhausted deck is usually someone, and that is the same infinite loop the check exists to
fix. Mirror `knightMoveIO` (`models/game.js:515-520`): a knight only matters if playing every one in
hand could actually take Largest Army from its current holder (or reach `largest_army_count` when
nobody holds it), and never if this player already holds it.

**Decided: one-step check, no graph search.** A hammer test confirmed that once the predicate is
true, infinite resources plus every valid corner and edge id plus dev-card buys over 30 turns
changes no VP. The state is a fixed point.

Note a `dVp` in hand is **not** a future VP source: `bought()` pays its point at purchase
(`models/player.js:77`). Only an unplayed knight is.

**Fix shape:**

- `models/game.js` — `#canGainVp(p)` near `#getRandom`: false for `removed`, otherwise true if any
  of (a) a knight that could take Largest Army, (b) a settlement under `PIECES_COUNT.S` with a legal
  corner from `getSettlementLocationsFromRoads`, (c) a settlement to upgrade and a city under
  `PIECES_COUNT.C`, (d) a road under `PIECES_COUNT.R` with a legal edge from
  `getRoadLocationsFromRoads`. Then `#isStalemate()` is
  `!this.dev_cards.length && !this.players.some(p => this.#canGainVp(p))`. The deck test first keeps
  it O(1) in every real game.
- `models/game.js` — split the body of `#onPlayerVpChange`'s timeout into
  `#endGame(player, stalemate)` so both paths build the same `end_context`; add `stalemate: true`
  and `tied_pids` (every pid sharing the winning total) to it. The `#ending` latch (`5865429`)
  already covers re-entrancy.
- `models/game.js` `#next()`, `case ST.PLAYER_ROLL` — before `#expect`, if `#isStalemate()` pick the
  winner by the tie-break above and call `#endGame(winner, true)`. `turn < 3` returns above the
  switch, so setup is never tested.
- `public/js/ui/alert_ui.js` `renderEndGameAlert` — on `stalemate`, replace the "Won" line with
  "Board exhausted", and when `tied_pids.length > 1` add "tied on N VP, won on tie-break".
- `public/js/const_messages.js` — a `STALEMATE_STATUS` beside `END_STATUS`.

`tests/stalemate_test.js` would assert: a boxed-in board with an empty deck ends at the next roll
and awards on current VP; the same board with one dev card left, and one with a knight that could
still take Largest Army, both keep playing; a three-way tie picks by cities, then settlements, then
pid.

**Not doing, if it is ever picked up:** reachability search over future board states,
resource-solvency checks (dice keep paying, so being broke is never permanent), peeking at the dev
deck's contents (deck knights are a Largest Army source too, so `length` is the correct test), and a
true multi-winner draw screen.

---

## 4. Verification gap

- **Drawing a map in the editor and playing it is still a manual one-look check.** Everything else in
  the visual suite is scripted — see [`tests/visual/README.md`](tests/visual/README.md).

---

## 5. Comments still owed

Three places where the decision was "leave the code, write down why" (§6 below) and the note was
never written. Verified absent 2026-09-17.

- `public/css/map-editor.css` — say that the duplicated `@font-face` and image paths are deliberate:
  `deploy-gh-pages.sh` ships `map-editor.html` standalone to GitHub Pages, where absolute
  `/images/…` would break under the subpath. Without the note, the next reader "fixes" it.
- The five tail-appended override sections (`login.css`, `waiting_room.css`,
  `index/all-players.css`, `index/board.css`, `index/current-player.css`) — banner comment saying
  source order *is* the cascade and several of these rules are load-bearing. Merging them is HIGH
  RISK; the comment is the whole task.
- `public/css/constants.css` — a comment block documenting the media-query breakpoints: `768px` ×23,
  `769px` ×6, `480px` ×5, plus the one-offs (`500/450/400/850/800/994/280`). Media queries cannot use
  `var()`, so documenting is the only available win.

---

## 6. Deliberately NOT doing

Recorded so they don't get re-proposed. Read before opening any of them.

- **`public/js/socket_manager.js` event bindings** look like an obvious candidate for a
  `{event: handler}` table plus a loop. Don't. They are 40 one-line, greppable, individually
  documented bindings; a table saves ~20 lines and makes "where is `LONGEST_ROAD` handled" harder to
  answer. Simple-but-verbose wins.
- **`public/js/board/board.js` `findLongestPathFromRoads`** is genuinely complex, but the complexity
  is the problem's, not the code's.
- **`public/js/player/player.js` duplicating `hasAllResources`** from `models/player.js`. Unifying
  means the browser importing a server model — worse. Leave it.
- **`map-editor.css` duplicating `@font-face` and image paths** is deliberate (see §5 for the comment
  that is owed); don't "fix" it.
- **Merging the tail-appended CSS override sections** — source order is the cascade. Comment only
  (§5).
- **Consolidating media-query breakpoint values** — changes what reflows at which width. Document
  (§5), don't touch.
- **`index/animations.css` dev-card sprite vs `index/current-player.css`.** The bodies match but the
  selectors do not (`.card.dK::before` vs `.card[data-type="dK"] .card-front::before`, different DOM,
  different files). Sharing them means a cross-file selector union that couples the animation overlay
  to the player hand. Costs more clarity than the ~40 duplicated lines buy back.
- **Four near-identical "primary button" definitions.** A shared `.btn` would have to sit before five
  nested game-panel blocks with different geometry; the cascade risk is real and the payoff is
  cosmetic. `login.css` already has a `.btn` system if this is ever revisited.
- **Splitting `models/game.js` (~900 lines) or `index.js` into modules.** Out of the agreed surgical
  scope of the cleanup. Revisit only when a concrete change is made harder by the file size — see §7.

---

## 7. Tech debt

- Move to React (or any partial rendering lib).
- More tests — `tests/` covers dice, initial build, road building, location-click validation,
  game lifecycle (abandonment and end-of-game) and a game smoke test.
- Button and other reused components.
- Optimization (memory[^1], speed, colours).
- Further modularisation (`models/game.js` and `public/js/game.js` are both ~900 lines). Note §6:
  this is deferred, not free.
- Render beaches on the resource tile instead of Sea.
- Move game state to a DB so it survives a restart (`@todo` in `index.js`; today a deploy ends every
  game in progress — see [`DEPLOY.md`](DEPLOY.md)).
- Variable naming convention pass in `public/js/ui/board_ui.js` (`@todo` in place).
- Modularise `public/css/map-editor.css` (`@todo` in place).

---

## 8. Future ideas

Not scoped, not promised.

- Browser notifications.
- Join random games — private & public games.
- Rethink ports: multiple in a single Sea tile; disallow connected edges of land being added as ports.
- Social login (with picture and/or just a name/id).
- Discord help (for talking).
- Trade negotiations.

---

## 9. Expansions — planned, in order

Decided 2026-09-23. Step 0, the own-turn win rule and the 5+ player phase (a special building phase
then, paired players since `align-official-rules`), shipped 2026-09-23. Each item below becomes its own OpenSpec change,
explored and proposed only after the previous one lands.

**Ground rules for all of them:**

- **Simplicity first.** Add the least logic the official rule needs, reuse the state machine and
  `expected_actions` (the `ROBBER_DROP` pattern already waits on N players in parallel), and don't
  build a rules engine ahead of need. Each expansion brings only the plumbing it uses.
- **Official rules only.** Custom/house rules may come later; keep constants in one place so they
  can become per-game config then.
- **Bots play the base game only** (2-10 players, paired phases included). The lobby
  must refuse bot seats when an expansion is selected, and the server must refuse them too.
- Every new string goes into both `en` and `es-AR`.

### 9.1 `add-seafarers` — next, spec below

Written 2026-09-23, right after step 0 shipped. This is the input for `/opsx:propose`: it says what
the rules are, what the code already gives us, where each rule lands, and what is left open. The
board already has sea tiles with corners and edges, custom mapkeys and the editor, so this is the
natural first expansion.

**Rules to check against the printed rulebook before proposing.** Everything below comes from
the Seafarers rules as remembered, not transcribed. These points need the rulebook open: the
New Shores tile layout, the 14 VP target, the 2 VP island bonus, and where the pirate starts.
Nothing else depends on them being exactly right.

#### Scope

In: ships (build, move, Road Building), longest trade route, pirate, gold fields, island bonus,
starting on the main island only, one scenario (Heading for New Shores, 3-4 players),
`config.expansion` in the lobby, the bot block, editor tokens for gold and the pirate starting
tile, `en` + `es-AR` strings.

Out: every other scenario (fog, discovery, Through the Desert, and so on), the 5-6 player New
Shores layout, bots that can sail, Harbormaster, variable island bonus per island, house rules.
One scenario proves the plumbing; adding another later is a preset and a few constants.

#### Rules, as they will be built

**Ships.**

- Cost lumber + wool, 15 per player (`PIECES_COUNT`).
- An edge takes a ship when at least one of its two tiles is sea; it takes a road when at least
  one is land. A coast edge (land on one side, sea on the other) takes either, but only one piece.
  Sea on both sides takes ships only, land on both sides roads only.
- Ships may use the grid border (an edge with a single sea tile). Our maps have no physical
  frame, and on a hand-made map the outer rim can be the only sea route to an island. Decided
  2026-09-23.
- A new ship must touch the player's settlement or city, or continue the player's own ship at a
  corner that holds no opponent building. **A ship never joins a road directly.** They meet only at
  the player's own settlement or city. The same holds the other way: a road cannot grow off a ship
  end.
- Settlements may be built off a ship, at a corner touching at least one land tile. That is the
  whole reason ships exist.
- A port reached by ship works like any port. `Player.addPort` already runs on every settlement.

**Moving a ship.** Once per turn, active player, `PLAYER_ACTIONS` only (never in a special
building window, never before the roll). The ship must:

- sit at the open end of a route: one of its corners holds no building of the player's and no
  other ship of the player's. A route with both ends on the player's buildings is closed and
  nothing in it moves;
- not have been built this turn;
- not lie on an edge of the pirate's tile.

It moves to any edge a new ship could be built on right now, counted without the ship being moved
and never onto the pirate's tile. It costs nothing, and the longest trade route is computed again
after the move. That count can go **down**, the one case the current code never handles for the
mover (see Implementation).

**Longest trade route** replaces longest road. Roads and ships count together, minimum 5 as now.
The route may switch between road and ship only at a corner with the player's own settlement or
city. An opponent building still cuts it, as now.

**Pirate.** A second blocker that only goes on sea tiles.

- On a 7, or when a Knight is played, the player moves the robber **or** the pirate, to a
  different tile. There is no mode switch: clicking a land tile moves the robber, clicking a sea
  tile moves the pirate.
- The pirate steals one card from a player with a ship on any edge of its tile (instead of a
  building on its corners).
- No ship may be built on an edge of the pirate's tile, and no ship there may move. It blocks
  nothing else. Sea produces nothing and ports still work.
- Its starting tile is marked in the mapkey. A map without one keeps it off the board until the
  first 7 or Knight.

**Robber on a map with no desert.** Seafarers maps often have none, so the robber starts off the
board and enters on the first 7. Today `Board.moveRobber` calls `findTile(this.robber_loc)`, which
throws when `robber_loc` is undefined, inside the timer. That is the same crash class as
`Board.maxPlayers`. It has to be guarded before any desert-less map ships, base game included.

**Gold fields.** A new land tile that produces the resource of the player's choice: 1 per settlement,
2 per city, blocked by the robber like any tile.

- After a roll that pays gold, every paid player picks at the same time. It is a new state,
  `GOLD_PICK`, between the roll and `PLAYER_ACTIONS`, and it follows the `ROBBER_DROP` pattern: one
  `#expect` per player, a `gold_pick_time` timer (20 s), random picks on timeout. A roll that pays
  no gold skips the state.
- Setup: a second settlement next to gold yields one card of the player's choice per gold tile.
  That choice rides on the initial-build payload (`gold`, validated, random when missing or
  wrong), so setup needs no new state.

**Islands.** An island is a connected group of land tiles (a flood fill over `adjacent_tiles`,
computed once in the `Board` constructor as `tile.island`). All land tiles at one corner are
mutually adjacent, so a corner's island is well defined.

- **Home islands** are the islands a player's two starting settlements are on. A player's first
  settlement on each other island is worth the scenario's `island_bonus` VP (New Shores: 2, check;
  custom maps: 2, decided 2026-09-23).
  These are public points and never go away, even if that settlement later becomes a city.
  `player.bonus_islands` lists which islands a player has claimed. The points go through
  `changeVp`, so the own-turn win rule applies with no extra work.
- **Setup restriction.** With `setup_island: 'largest'` (New Shores sets it), starting settlements
  may only go on the island with the most land tiles. Custom maps default to no restriction.

**Road Building** builds two roads, two ships, or one of each. The payload names the piece per
location.

**Paired action phase** (5+ players, custom maps only for now, since New Shores seats 4): ships
may be built there and one may be moved, as on an own turn.

**Victory target.** A scenario brings its own (`win_points` on the preset: 14 for New Shores,
check). The host can still override it as today.

#### Mapkey

Two new tokens. `validateMapkey`, `TOKEN_RE`, `Board`, `Tile.generateMapKey`, the shuffler and the
editor palette all need them.

- `A` = gold field (Au). `G` is taken by pasture. A numbered land tile, `A5`. It has no
  `TILE_RES` entry, so `Board.distribute` ignores it, and a new `Board.distributeGold(num)` returns
  `{ pid, count }[]`.
- `P` = plain sea where the pirate starts. It parses to `type: 'S'` plus `board.pirate_loc`. If
  there are several, the last one wins, like `D` and the robber. No port on it. `generateMapKey`
  writes it back as `P`.

**Shuffle keeps tiles on their island.** A tile or number shuffle swaps only inside one island, so
gold stays on the small islands and the main island stays a base-game-like board. Ports shuffle as
today. On a base map (one island) the result is the same as now.

#### Config, lobby, bots

- `GAME_CONFIG.expansion: 'base'`. The host picks `'base' | 'seafarers'` in the lobby. It is
  validated in `waitingRoomChangeConfigIO`, and it is carried by `io_manager` `CHANGE_CONFIG` and
  `index.js` `toScript` the way `dice_mode` is.
- `MAPS` entries gain `expansion`. The lobby's map list shows only the presets for the chosen
  expansion. A mapkey containing `A` or `P` is refused unless `expansion === 'seafarers'`. The
  first Seafarers preset is `new_shores` (`max_players: 4`, `win_points`,
  `island_bonus`, `setup_island`).
- **Bots are blocked on both sides.** `addBot` and `setBotLevel` refuse in a Seafarers game.
  Switching to Seafarers while a bot is seated is refused, and the lobby disables the option and
  says why. `takeOverSeat` refuses too, so a quit seat stays empty and is skipped, as with no
  takeover.

#### Implementation shape

Most of the rules code goes in the shared `public/js/board/*`, so client highlights and server
validation cannot disagree.

- `edge.js`: `ship` beside `road`, a `buildShip(pid)`, and an `owner` getter (`road ?? ship`).
  Also `tiles`, the tiles both corners share (one or two), set in `Board.createEdge`. With those,
  the land/sea/border classification is one line each.
- `corner.js`: `getEdges(-1)` means "no owner" (neither road nor ship). `getEdges(pid)` stays
  roads-only, and a sibling `getShipEdges(pid)` covers ships. `hasBuildingOf(pid)` is a one-liner
  both connection rules need.
- `tile.js`: `getEdges()` (the six edges of the tile) for the pirate's block and steal, and
  `island`.
- `board.js`:
  - `getShipLocations(pid, ships, buildings)`: the ship connection rule, minus edges of the
    pirate's tile.
  - `getRoadLocationsFromRoads` gains the "touches land" test. That also closes a gap in the base
    game: today a road can cross a one-tile sea channel, because the check is per corner, not per
    edge.
  - `getSettlementLocationsFromRoads(roads, ships)` adds coastal corners off ships.
  - `getMovableShips(pid, ships, built_this_turn)`.
  - `movePirate(id)`, and the `robber_loc` guard.
  - `findLongestPathFromRoads` walks both kinds, and allows a kind change only at a corner with the
    player's own building. This is one extra condition in the existing recursion.
  - `build()` handles `'SH'`.
  - The islands flood fill.
- `const.js`:
  - `PIECES` / `PIECES_COUNT` / `COST` gain `SH` (ship). A two-letter key, like `DEV_C`, because
    `S` is the settlement.
  - `TILES` gains `A`.
  - `GAME_STATES.GOLD_PICK`, `GAME_CONFIG.expansion`, `gold_pick_time`.
  - `SOCKET_EVENTS.MOVE_SHIP` and `GOLD_PICK`.
- `models/player.js`:
  - `pieces.SH` and `canBuy('SH')` (generic already).
  - `ships_built_turn` (ids, reset in `resetDevCard`'s turn-start path) and `moved_ship` (bool,
    same reset).
  - `bonus_islands`, and `toJSON` fields for all of them.
- `models/game.js`:
  - `clickedLocationIO(pid, loc_type, id, piece)`: an edge click names `'R'` or `'SH'`, and a
    missing value keeps meaning `'R'`, so the base client is unchanged.
  - `moveShipIO(pid, from, to)`.
  - `goldPickIO(pid, resources)` plus `#expectedGoldPick`, and a `NEXT_STATE` detour through
    `GOLD_PICK` only when the roll paid gold.
  - `#expectedRobberMove` branches on the tile type (sea goes to the pirate, stealing from ship
    owners), and `knightMoveIO` gets that for free.
  - `roadBuildingIO` takes `{ piece, loc }` pairs.
  - `#expectedInitialBuild` takes `road_piece` and `gold`, and applies the setup restriction.
  - `build()`: the "breaking enemy roads" check reads `edge.owner`, not `edge.road`. The island
    bonus lands here too.
  - `#checkLongestRoad` gains a full recompute for the mover after a ship move. The route can
    shrink, so it reuses the `broken_pid` branch with the mover as the broken player.
- `models/io_manager.js`: the two new events, plus `updateBuild` / `updateShipMoved` /
  `updatePirate` broadcasts.
- Bots: `controller.js`, `moves.js` and the trackers need nothing beyond not being reached, since
  the lobby block makes a bot in a Seafarers game impossible. Add a server test that proves it.
- Client:
  - `game.js`: `possible_locations.SH`, the move-ship mode (click an end ship, then its targets),
    the pirate on the board and in the robber flow, and the gold picker.
  - `ui/player_ui.js`: a build-ship button with its count, shown only in Seafarers.
  - `ui/board_ui.js`: ship, gold tile and pirate art.
  - `ui/res_selection_ui.js`: reused for the gold pick, as Year of Plenty does.
  - `ui/all_players_ui.js`: island bonus in the VP breakdown.
  - `ui/alert_ui.js`: status lines for ship built, ship moved, pirate moved and stole, gold picked,
    and island bonus.
  - `waiting_room.js`: the expansion picker and the filtered map list.
- `map-editor.js`: palette entries for `A` and `P`.
- Locales: every new string in `en` and `es-AR`, including the names of the tile, piece and state,
  and the text of the lobby's bot-block message.

#### Build order

Each step leaves the base game green and can be its own commit.

1. **Board model:** edge ownership, edge tiles, the per-edge "touches land" road test, the
   `robber_loc` guard, the `A` and `P` tokens, the islands, the per-island shuffle. Base game
   behaviour unchanged, and the existing tests prove it.
2. **Config and lobby:** `expansion`, the preset list filter, the bot block.
3. **Ships:** building, the settlement-off-ship rule, the two setup choices, Road Building, and the
   longest trade route.
4. **Ship movement.**
5. **Pirate.**
6. **Gold:** the state, the picker, and gold in setup.
7. **Islands:** the bonus and the setup restriction. The New Shores preset, transcribed from the
   rulebook.
8. **Map editor tokens and the manual pass over strings.**

#### Tests

- `tests/ships_test.js`: the legality table (land/land, coast, sea/sea, border allowed), no road-to-ship
  joint without a building, settlement off a ship, 15-piece cap, ships in a paired action
  phase.
- `tests/ship_move_test.js`: open end only, closed route frozen, not built this turn, once per
  turn, pirate-adjacent frozen, and the route shrinking and losing the title.
- `tests/trade_route_test.js`: mixed route through a building counts, through a bare corner does
  not, an opponent settlement cuts it.
- `tests/pirate_test.js`: 7 and Knight on sea move the pirate, steal from ship owners only, block
  build and move, no-desert map does not crash.
- `tests/gold_test.js`: parallel pick, timeout picks at random, robbed gold pays nothing, setup gold
  choice, the state is skipped when no gold paid.
- `tests/islands_test.js`: flood fill, home islands from setup, bonus once per island per player,
  the setup restriction, and the own-turn win through a bonus.
- `tests/map_grid_test.js` / `coastline_test.js`: the `A` and `P` round trip, and the per-island
  shuffle keeping tiles in place.
- Bot seat refusal in `tests/bot_seats_test.js`.

#### Decided 2026-09-23

- **Expansion maps belong to their expansion.** A preset or custom mapkey that uses Seafarers
  features (`A` or `P`) only plays in a Seafarers game. `waitingRoomChangeConfigIO` refuses it in
  a base game, and the lobby says why. Seafarers presets never appear in the base game's map list.
- **Per-island shuffle** (as proposed under Mapkey), not a fixed layout.
- **Island bonus on custom maps is 2**, the same as New Shores. There's no lobby setting for it.
- **Ships may use the grid border.** Hand-made maps can have the outer rim as the only way to an
  island.

**Decided 2026-09-24, after checking the 2025 rulebooks (CN3083, CN3084).** These replace the
matching points above, and the full change is in `openspec/changes/add-seafarers`.

- **Paired players come from `align-official-rules`** (2026-09-25). They replace the special
  building phase in every 5+ game, and 7-10 seats get more than one paired player. Seafarers only
  adds ships to what a paired player may do: build them and move one. `add-seafarers` now depends
  on `align-official-rules` and `implement-missing-rules` (the bank; Road Building with one piece)
  and applies after both.
- **The pirate may be moved off the board** ("to the frame"), which steals nothing.
- **The island bonus on custom maps is 1 VP**, with a 12 VP target, from the book's New World
  variant. This replaces the earlier 2 VP. New Shores keeps 2 VP and 14 VP.
- **Shuffle:** as in the book, the main island shuffles on its own and all the small islands shuffle
  together as one pool. This replaces the per-island shuffle.
- **Frame:** a new `X` token, a non-playable border tile that may carry a port. Coasts facing it
  take no ships.
- **Seafarers needs 3 or more seats.**
- **New Shores ships in all three layouts:** 3 players, 4 players and 5-6 players. The 3-player map
  starts the robber on the 12.
- **Escalation to 7-8 and 9-10 (2026-09-25):** New Shores gets 7-8 and 9-10 presets that repeat
  the book's 4 → 5-6 step. Preset targets are the base target + 4 (14 / 14 / 14 / 16 / 17). Custom
  Seafarers maps default to 12 / 12 / 12 / 14 / 15 with a 1 VP island bonus. Seafarers adds no
  development cards.

### 9.2 `add-traders-barbarians`

A box of independent pieces, each can be its own small change: Friendly Robber, Harbormaster,
event cards instead of dice (fits as a new `dice_mode`), Catan for 2, then the scenarios (Fishermen,
Rivers, Caravans, Barbarian Attack, Traders & Barbarians). Explore which to take first when we get
there.

### 9.3 `add-cities-knights`

The largest one by far: commodities (paper, cloth, coin) in hand, city improvements on three tracks
plus metropolises, knights (corner piece, three levels, active/inactive), barbarian ship and event
die, about 20 distinct progress-card effects, many interactive and off-turn. It replaces dev cards
and Largest Army. It will likely need a generic card-play dispatcher and a prompt stack for off-turn
responses. Design those only then, following the simplicity rule.

---

## 10. Repo weight — decided, not done

~112 MB of root PSDs and loose PNGs, about 75% of the repo. Untracking them is easy; reclaiming the
space needs a history rewrite, and the VPS deploys by `git pull`, which a rewrite would break.
Separate decision, separate day. `.dockerignore` already excludes them, so the image is fine.
`.DS_Store` is not in `.dockerignore`; four exist on disk but they are gitignored, so nothing ships.

[^1]: https://www.ditdot.hr/en/causes-of-memory-leaks-in-javascript-and-how-to-avoid-them
