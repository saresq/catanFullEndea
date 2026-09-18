# TBD

Every piece of work that is planned, deferred or half-built, in one place. Nothing here is in
progress. The counterpart is [`todo.md`](todo.md), which is the *done* log of the 2026-09-17 cleanup
and is kept for its reasoning, not for its checkboxes.

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

**Found:** 2026-09-17, while fixing the `/api/sessions/clear` auth bypass (`todo.md` §1).
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
§1 security commit.

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

**Found:** 2026-09-18, designing the fix for `todo.md` §12.4. **Severity:** low, and hand-made maps
only. Designed in full, deliberately not built — the numbers below say why.

`models/game.js` `#onPlayerVpChange` is the only path to `END`, and it returns early unless someone
reaches `win_points`. On a small hand-made map the board can run out: every corner taken or blocked,
every legal edge built, dev deck empty. No VP can change again, so the turn timer cycles between
live players forever and the game can never be finished. Official Catan has no stalemate rule
because a boxed board cannot reach the state; the map editor can.

**Why it is not built.** A soak fired the predicate 0/25 times on the preset map and 6/25 on a tiny
hand-made one. It also cannot fix the "server loops forever" symptom it was proposed for: the
predicate needs an empty dev deck, and timer auto-advance never buys a card, so an abandoned game
always has a full deck. That was `todo.md` §12.4 and is fixed. This is worth ~40 lines only because
§12.1 established tiny hand-made maps as a real thing users make, and this is the second way they
wedge.

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
  and `tied_pids` (every pid sharing the winning total) to it. The `#ending` latch added in §12.5
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

Three places where the decision was "leave the code, write down why" (`todo.md` §"Deliberately NOT
doing") and the note was never written. Verified absent 2026-09-17.

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
- Seafarers expansion (fairly easy one).
- Trade negotiations.

---

## 9. Repo weight — decided, not done

~112 MB of root PSDs and loose PNGs, about 75% of the repo. Untracking them is easy; reclaiming the
space needs a history rewrite, and the VPS deploys by `git pull`, which a rewrite would break.
Separate decision, separate day. `.dockerignore` already excludes them, so the image is fine.
`.DS_Store` is not in `.dockerignore`; four exist on disk but they are gitignored, so nothing ships.

[^1]: https://www.ditdot.hr/en/causes-of-memory-leaks-in-javascript-and-how-to-avoid-them
