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

- **No message when a trade request is rejected.** The state is tracked (`rejected[]`,
  `status: 'failed'` in `models/game.js`) and the ongoing-trades panel updates (`trade_ui.js`), but
  nothing is written to the alert line the way a completed trade is. Proposals to the active player
  already get one (`alertProposalFailed`); requests to the table do not.

---

## 3. Known gaps and small bugs

- **Touch targets below 44px.** The 2026-09-18 measurements predate the dock, options menu and
  trade drawer rework; the gear, the dock actions and the drawers now meet 44px. Still under, by the
  CSS (not re-measured): `button.toggle-players` (`index/all-players.css`, ~4px padding), and the
  round close buttons: 2rem in `index/alert.css`, 2.25rem in `index/accessibility.css`, 1.875rem in
  `index/current-player.css`.
- **Numberless tiles in the mapkey** — let a tile declare no number and have the game fill it. Not
  implemented; the decoder requires a number on every resource tile.
- **Generic resource tiles in the mapkey** — same idea for the resource itself.
- **Timer gives no warning in its last seconds** (`public/js/ui/player_ui.js`) — no colour or focus
  change.
- **Login splash image is not preloaded**, so the first paint can flash.
- **Development card styling breaks in Safari.** Unverified since it was reported.

### 3.1 A board nobody can build on never ends the game

**Found:** 2026-09-18, designing the abandoned-game reaper (`5865429`). **Severity:** low, and hand-made maps
only. Designed in full, deliberately not built — the numbers below say why.

`models/game.js` `#endGame` is the only path to `END`, reached from `#onPlayerVpChange` and
`#checkTurnStartWin`, and both return early unless someone reaches `win_points`. On a small
hand-made map the board can run out: every corner taken or blocked, every legal edge built, dev
deck empty. No VP can change again, so the turn timer cycles between
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

**Decided: one winner, not a draw.** The end screen hardcodes a single winner (`end_context.pid`,
ranked first in `public/js/ui/alert_ui.js` `renderEndGameAlert`) and a real multi-winner screen is
40-60 lines of markup and CSS. Highest VP, then most cities, then most settlements, then lowest pid.
But ties are the *normal* case here, not the edge case — a three-way 4-4-4 on a symmetric tiny map
was confirmed, and turn order broke every one of 60 sampled stalemates — so the alert has to say so
rather than claim a clean win.

**Decided: the knight clause tests reachability**, it does not just check for a held card. A bare
`!p.closed_cards.dK` blocks the stalemate forever whenever anyone sits on an unplayed knight, which
on an exhausted deck is usually someone, and that is the same infinite loop the check exists to fix.
Mirror the Largest Army test in `knightMoveIO` (`models/game.js`): a knight only matters if playing
every one in hand could actually take Largest Army from its current holder (or reach
`largest_army_count` when nobody holds it), and never if this player already holds it.

**Decided: one-step check, no graph search.** A hammer test confirmed that once the predicate is
true, infinite resources plus every valid corner and edge id plus dev-card buys over 30 turns
changes no VP. The state is a fixed point.

Note a `dVp` in hand is **not** a future VP source: `bought()` pays its point at purchase
(`models/player.js`). Only an unplayed knight is.

**Fix shape:**

- `models/game.js` — `#canGainVp(p)` near `#getRandom`: false for `removed`, otherwise true if any
  of (a) a knight that could take Largest Army, (b) a settlement under `PIECES_COUNT.S` with a legal
  corner from `getSettlementLocationsFromRoads`, (c) a settlement to upgrade and a city under
  `PIECES_COUNT.C`, (d) a road under `PIECES_COUNT.R` with a legal edge from
  `getRoadLocationsFromRoads`. Then `#isStalemate()` is
  `!this.dev_cards.length && !this.players.some(p => this.#canGainVp(p))`. The deck test first keeps
  it O(1) in every real game.
- `models/game.js` — `#endGame(pid, vps)` already builds the one `end_context` both win paths use;
  give it a `stalemate` flag and add `stalemate: true` and `tied_pids` (every pid sharing the winning
  total) to the context. Its `#ending` latch (`5865429`) already covers re-entrancy.
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

A place where the decision was "leave the code, write down why" (§6 below) and the note was never
written. Verified absent 2026-09-25.

- `public/css/constants.css` — a comment block documenting the media-query breakpoints across
  `public/css`: `768px` ×34, `500px` ×21, `480px` ×9, plus the one-offs
  (`700/1800/769/481/760/800/850/994/1360`). Media queries cannot use `var()`, so documenting is the
  only available win.

---

## 6. Deliberately NOT doing

Recorded so they don't get re-proposed. Read before opening any of them.

- **`public/js/socket_manager.js` event bindings** look like an obvious candidate for a
  `{event: handler}` table plus a loop. Don't. They are ~30 one-line, greppable, individually
  documented bindings; a table saves ~15 lines and makes "where is `LONGEST_ROAD` handled" harder to
  answer. Simple-but-verbose wins.
- **`public/js/board/board.js` `findLongestPathFromRoads`** is genuinely complex, but the complexity
  is the problem's, not the code's.
- **`public/js/player/player.js` duplicating `hasAllResources`** from `models/player.js`. Unifying
  means the browser importing a server model — worse. Leave it.
- **Consolidating media-query breakpoint values** — changes what reflows at which width. Document
  (§5), don't touch.
- **Splitting `models/game.js` (~1,370 lines) or `index.js` into modules.** Out of the agreed surgical
  scope of the cleanup. Revisit only when a concrete change is made harder by the file size — see §7.

---

## 7. Tech debt

- Move to React (or any partial rendering lib).
- More tests — `tests/` covers the server rules (setup, first roll, dice, roads and Longest Route,
  paired players, trades, the win), bots, the map grid and coastline, i18n and game lifecycle; the
  client UI has only the visual suite (`tests/visual/`).
- Optimization (memory[^1], speed, colours).
- Further modularisation (`models/game.js` ~1,370 lines, `public/js/game.js` ~780). Note §6: this
  is deferred, not free.
- Render beaches on the resource tile instead of Sea.
- Move game state to a DB so it survives a restart (`@todo` in `index.js`; today a deploy ends every
  game in progress — see [`DEPLOY.md`](DEPLOY.md)).
- Variable naming convention pass in `public/js/ui/board_ui.js` (`@todo` in place).
- Modularise `public/css/map-editor.css` (~1,250 lines; its `@todo` went with the editor overhaul,
  the work did not).

---

### 7.1 Cleanup: files, scripts and docs nothing uses

A sweep for leftovers, one pass, then delete. Candidates found 2026-09-25 (check each before removing):

- `deploy-gh-pages.sh`, the `deploy-shuffler` npm script and its section in `DEPLOY.md`: the
  standalone map-editor build no longer works (the page is a template now) and is not maintained.
- `README.md`: the "For 7–10 players, the server enforces a preset map" tip (custom maps are kept
  now), the "Open the Browser Console to have control over all the game configs" line, and the legacy
  shuffler link.
- The five loose resource PNGs at the repo root (`Ladrillo`, `Madera`, `Oveja`, `Piedra`, `Trigo`):
  move them into `assets-src/` with the other sources, or drop them if the PSDs cover them.
- `.dockerignore` rules for `/*.psd` and `/*.png`: redundant, since the `Dockerfile` copies explicit
  folders.
- `Nice-to-have.md` next to this file: fold its ideas into §8 and remove it, so the backlog has one
  home.
- Unused sounds kept for Seafarers (`shore.mp3`, `game-bonus.mp3`): used once `add-seafarers`
  lands, otherwise remove.

## 8. Future ideas

Not scoped, not promised.

- Browser notifications.
- Join random games — private & public games.
- Rethink ports: multiple in a single Sea tile; disallow connected edges of land being added as ports.
- Social login (with picture and/or just a name/id).
- Discord help (for talking).

---

## 9. Expansions — planned, in order

Decided 2026-09-23. Step 0, the own-turn win rule and the 5+ player phase (a special building phase
then, paired players since `align-official-rules`), shipped 2026-09-23. Each item below becomes its
own OpenSpec change, explored and proposed only after the previous one lands.

**Ground rules for all of them:**

- **Simplicity first.** Add the least logic the official rule needs, reuse the state machine and
  `expected_actions` (the `ROBBER_DROP` pattern already waits on N players in parallel), and don't
  build a rules engine ahead of need. Each expansion brings only the plumbing it uses.
- **Official rules only.** Custom/house rules may come later; keep constants in one place so they
  can become per-game config then.
- **Bots play the base game only** (2-10 players, paired phases included). The lobby
  must refuse bot seats when an expansion is selected, and the server must refuse them too.
- Every new string goes into both `en` and `es-AR`.

### 9.1 `add-seafarers` — next, proposed

Fully specified in `openspec/changes/add-seafarers` (proposal, design, specs, tasks), from the 2025
rulebooks (CN3083, CN3084): ships, longest trade route, the pirate, gold fields, islands, the frame,
New Shores for every seat tier, the lobby's expansion setting and the bot block. Every decision taken
with the human on 2026-09-23 to 09-25 is recorded there. The rulebook transcription (layouts, ports,
targets, page references) is `openspec/changes/add-seafarers/new-shores-layouts.md`.

It depends on `align-official-rules` (Longest Route, road placement, paired players, player-count
rules) and `implement-missing-rules` (the bank, Road Building with one piece left), and applies
after both.

- **Fog / discovery tiles** (hexes revealed when a ship or road reaches them) belong to the Fog
  Islands scenario (SF p8), which is out of scope. It is a candidate for a later change.

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

~88 MB of editable art: the PSDs, now all in `assets-src/` (moved 2026-09-25, tracked on purpose),
the card masters in `assets-src/cards/`, and five loose resource PNGs at the root. The packed history
is ~170 MB. Reclaiming space needs a history rewrite, and the VPS deploys by `git pull`, which a
rewrite would break. Separate decision, separate day. None of it ships: the `Dockerfile` copies only
`index.js`, `models`, `config`, `views` and `public`.

[^1]: https://www.ditdot.hr/en/causes-of-memory-leaks-in-javascript-and-how-to-avoid-them
