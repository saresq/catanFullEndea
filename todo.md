# Cleanup TODO

**This is the done log** for the cleanup itself (§2-§11): what was changed, how it was verified, and
which decisions it rests on. Everything the cleanup chose *not* to do moved to [`TBD.md`](TBD.md).
§12 onward are findings from using the game afterwards and are not all closed — check the marker on
each one.

Findings from a whole-repo organization review. Golden rule for all of it: **keep it simple**.
The game works — nothing here is worth breaking it for.

Scope agreed: **surgical only**. No file moves, no module renames, no frameworks, no build step,
no TypeScript. Extract constants, collapse repeated branches into lookup tables, delete dead code,
fix verified bugs.

Sections are ordered by (value / risk). Work top to bottom; each section is meant to be its own
commit so it can be reverted alone.

Two verification tools back this up: the headless smoke test in **§2** for game logic, and
**Playwright MCP (§10)** for anything visual. Neither substitutes for the other — §2 can't see a
pixel, §10 can't tell you the longest-road calculation is wrong.

---

## Decisions (settled — 2026-09-17)

- **Custom map reshuffle** → **fix it, honor config.** `models/game.js:119` becomes
  `shuffle(this.config.map_shuffle)`. Custom maps survive, the map-editor checkboxes start working,
  normal games stop double-shuffling. See §4.1.
- **Background music** → **stays off by default; sound effects must keep working.** Note the
  correction in §4.4: there *is* a working manual toggle, so this is about autoplay, not about music
  being impossible.
- **Colour mismatches** → **fix the three sites AND do the CSS dedupe.** Full §9 is in scope.
- **Dice animation** → **show both dice.** See §4.5.

---

## 2. Safety net (do before any refactor)

**Risk: LOW. Adds files only.**

Verified this works: `Game` drives headless with a one-line fake io, no socket.io, no express.

```js
const fakeIo = { to: () => ({ emit: () => {} }) }
```

Probe output:
```
players: Alice,Bob,Cleo    win_points: 10  hand_limit: 7   dev_cards: 25
state after start: INITIAL_SETUP -> player_roll, turn 3
settlements each: 2,2,2   roads each: 2,2,2
dice: [6,6]  state: player_actions
```

- [x] Add `tests/game_smoke_test.js` — join -> start -> initial placement -> roll ->
      build -> trade (bank + player) -> rob -> win, with real assertions. Uses `node:test`.
- [x] Fix `package.json` `"test"` — now `node --test tests/`.
- [x] `tests/dice_test.js` rewritten as a real test: range/total invariants, whole range appears,
      loose bell-shape bounds, `avoidTotals` honored. Both engines.

---

## 3. Zero-risk deletes (one commit, nothing can break)

**Risk: LOW throughout. Nothing here is referenced.**

### Dead JS

- [x] `public/js/const.js` — `RESOURCE_EMOJIS`, `DEVELOPMENT_CARDS_DECK`, `DC_VICTORY_POINT_CARD_VARIETIES`,
      `ROLL`. Zero external uses each (`ROLL` superseded by `models/dice.js`).
- [x] `public/js/const.js:192-194` — commented-out `GAME_STATES` members.
- [x] `models/io_manager.js` — `updateRobbed_Private`, never called.
- [x] `models/game.js:876-879` — commented-out duplicate `removePlayer`.
- [x] `public/js/waiting_room.js:264-270` — `checkAndEnd()`, never called.
- [x] `public/js/board/board_shuffler.js:40` — `const adjacent_numbers = {}` declared, never read.
- [x] `public/js/board/board.js:38` — bare expression whose result is discarded; line 39 recomputes it.
- [x] `public/js/game.js:190-192` — `if (key.includes('name')) { /* nothing */ }`.
- [x] `public/js/login.js:102-112` — 11 lines of commented-out console art.
- [x] `public/js/ui/player_ui.js:43-51` — 9 commented debug lines inside `render()`.
- [x] `public/js/map-editor.js:9` — `PROD_URL`, unused (and it's the stale onrender URL).
- [x] `public/js/map-editor.js:783-829` — `injectGameLinkInInfo()`, 47 lines, never called. Makes
      `:560`'s `updatePlayLinkHref` permanently undefined and `map-editor.css:135-149` dead.
      Either call it from the constructor or delete all three together.
- [x] `public/js/ui/map_builder_board_ui.js:7` — `$tile_selector` is always `null` (queried before
      `map-editor.js:121` creates the element). Harmless only because `renderTileSelector()` at
      `:25-28` is an empty stub. Delete both, plus the passthrough constructor at `:10-12`.

### Dead UI

- [x] `public/js/ui/trade_ui.js:244-246` and `:271-273` — Counter and Withdraw buttons have empty
      handlers. Silently dead buttons are worse than absent ones: hide them or leave a comment.

### Dead CSS

- [x] `public/css/resources.css:42-75` — `.res-card`, zero references.
- [x] `public/css/login.css` — `.btn-selection` (`:102-134,160-162,524-527`), `.left-column`/`.right-column`
      (`:343-355`, `:153-158`), `.section-title` (`:357-362`), `.players-selection` (`:393-395`),
      `.advanced-options` (`:398-421`, also `display:none`). ~60 lines.
- [x] `public/css/waiting_room.css:181-201` — `.value-input`, never rendered.
- [x] `public/css/index/alert.css:501-505` — `.status-history-zone .subtitle`, never rendered.
- [x] `public/css/index/current-player.css:1437-1438` — empty `.card-container { }`.
- [x] `public/css/map-editor.css:964-966` — `display: none !important` kills the three
      `.cancel-container` blocks above it (`:553-558`, `:770-775`, `:903-908`) **and** the JS handler
      at `map-editor.js:332-340`. Delete all four together.

### Selectors that never match (~80 lines)

- [x] `public/css/index/current-player.css:1191-1231` and `public/css/index/alert.css:602-643` —
      `.pcN &` nested inside a `::before` rule expands to `.pc1 :is(… .p-name.me::before)`, and
      `:is()` cannot contain a pseudo-element, so the whole selector is dropped. Doubly dead:
      `.me::before { content: none }` means the element isn't rendered anyway.
- [x] `public/css/index/accessibility.css:95` — `padding-top: -1px` is invalid CSS, silently
      dropped. The zoom-in nudge it was meant to apply has never worked.
- [x] `public/css/index/trade.css:244-246` — `.pc0 .text` unreachable (see §9.2).

### Repo hygiene

- [x] `package.json` — remove the `dev-static` script; `dev-static-pages.sh` was deleted in `1eb1045`.
- [x] `package.json` — drop `light-server` (zero uses; its only consumer was that deleted script).
- [x] `package.json` — move `nodemon` and `push-dir` to `devDependencies`. `nodemon` currently ships
      into the production image.
- [x] **`package.json` — declare `cookie`.** `index.js:3` imports it but it's not in the manifest; it
      resolves only as a hoisted transitive of express 4.19. An express bump breaks the server at
      startup. **MEDIUM RISK if left alone**, low risk to fix.

---

## 4. Verified bugs (each small, each checkable against §2)

### 4.1 `Game.start()` destroys custom maps — **highest impact**

**Risk: LOW to fix. DECIDED: fix it, honor config.**

`models/game.js:119` calls `shuffle('all')` unconditionally, ignoring `config.map_shuffle`.
`index.js:138` already shuffled per config. So the map editor's "do not shuffle resources / numbers"
options and `map_shuffle: 'none'` are silently overridden at game start. Proven:

```
mapkey BEFORE start:  S.S.S.S -S.G2.J3.S -S.C4.M5.F6.S ...
mapkey AFTER  start:  S.S.S.S -S.G8.M2.S -S.J3.C4.J6.S ...   CHANGED: true
```

- [x] `models/game.js:119` — `shuffle(this.config.map_shuffle)`. Also removes the double shuffle on
      every normal game.

### 4.2 Robber-drop submit handler stacks up

- [x] `public/js/ui/robber_drop_ui.js:60` — `#addEventListeners()` runs on every `render()`, but
      `$drop_submit` is captured once as a class field. Second robber drop of a game fires
      `onDropSubmit` twice, third fires three times. Move that one listener into the constructor
      (`:14-26`); leave the `.ctrl` listeners in `#addEventListeners`.
      **Done. Verified in-browser (pre-fix 1/2/3 submits over three renders, now 1/1/1). Note: the
      user-visible symptom never fired — `setWaiting(true)` removes `active` on the first handler,
      so the stacked duplicates bailed at their own guard. Real leak, no double discard.**

### 4.3 "Robber is blocking X" hint permanently dead

- [x] `public/js/game.js:209` — `robbed_tile?.num === total` compares a **string** (`tile.num` comes
      from the mapkey regex, `board.js:79`) to a number. Always false. Fix: `+robbed_tile?.num === total`.

### 4.4 Background music — dead autoplay path

**DECIDED: BGM stays off by default. Sound effects must keep working.**

Correction to the first pass: background music is **not** impossible. There is a working manual
toggle — the 🎵 icon and the `m` key (`accessibility_ui.js:116,184`) call
`toggleBgm(!muted)` -> `this.#bgm?.play()`, and that path bypasses `#muted` entirely. What
`#muted = true` actually does is suppress **autoplay on load**, which browsers block anyway.

Sound effects are on a separate flag (`#notif_muted`) and are unaffected by any of this.

- [x] `public/js/audio_manager.js:15` — `!this.#muted && this.#bgm.play()` is dead (and would be
      blocked by autoplay policy regardless). Delete the line and the `#muted` field.
- [x] `public/js/audio_manager.js:24-30` — the ducking block is gated on `!this.#muted`, so it never
      runs *even for players who turn music on*. With `#muted` gone, gate it on whether BGM is
      actually playing (`!this.#bgm.paused`) so music dips under effects for those players.
- [x] `public/js/audio_manager.js:27` — `clearInterval` on a `setTimeout` handle. Works in browsers
      (shared id space) but should be `clearTimeout`.

### 4.5 Smaller confirmed bugs

- [x] `public/js/ui/player_ui.js:190` — disabled "Buy Dev Card" is clickable through its child
      `<img>`. Uses `e.target` where every sibling handler tests the button element. Fix:
      `this.$buy_dev_card.classList.contains('disabled')` and read `dataset.count` off the button.
- [x] `public/js/ui/alert_ui.js:128` — regex is `/<br\/>?/g` (matches `<br/` with optional `>`)
      instead of `/<br\/?>/g`. Plain `<br>` leaks through. `setStatus:113` and `setStatusBarOnly:122`
      have it right.
- [x] `models/game.js:463` — tests `giving` (an object, always truthy) instead of `giving_total`.
      Server accepts a trade offering literally nothing; confirmed a `{}` -> `{W:1}` request is
      accepted and pushed to `ongoing_trades`.
- [x] `public/js/ui/all_players_ui.js:103-104` — destructures `this.player_refs[player.id]` before
      the `if (!$p) return` guard. Throws instead of returning for a player without a ref.
- [x] `public/js/game.js:510-512` — `findTile(id)?.getAllCorners().filter(…)`: the `?.` guards
      `findTile` but `.filter` then runs on `undefined` if the tile is missing.
- [x] `public/js/ui/animations_ui.js:31-32` — `animateDiceRoll(d1, d2)` builds
      `box.innerHTML = \`${mk(d1)}\``; `d2` is accepted and discarded, so the floating result shows
      one die. **DECIDED: lost line.** Make it `\`${mk(d1)}${mk(d2)}\`` so both dice show.
      **Done, but `animateDiceRoll` has no callers anywhere — nothing creates `.dice-float` in a real
      game. Verified by calling it directly (2 dice, 3 and 5 pips). Wire it into `updateDiceValueSoc`
      or delete the method.**
- [x] `public/js/waiting_room.js:272-280` — `addPlayer` unconditionally does `joined_count++`, but a
      re-joining player overwrites the same slot. Header count then disagrees with
      `updateStartBtnState`, which recomputes from the array. Fixed for free by §6.
- [x] `public/js/ui/player_ui.js:419` vs `:551` — count badge `top` uses a fixed `-0.75rem` in one
      place and `calc(-0.75rem - ${(visualCount-1)*2}px)` in the other, so the badge jumps the first
      time a card is added or removed. Pick one formula.
- [x] `public/js/map-editor.js:549,692,774` — `/([+|-])/g` matches a literal `|` as well as `+`/`-`.
      Harmless with today's mapkey alphabet, a landmine later. Should be `/([+-])/g`.
- [x] `public/js/map-editor.js:648-649` — comment says "10% should be 6 or 8", code uses
      `totalTiles * 0.2` (20%). One of the two is wrong.
- [x] `public/js/game.js:200-201` — comment says "keep End Turn disabled for 5 seconds", call is
      `startEndTurnCooldown(1000)`. Comment or value is wrong.
- [x] `public/js/socket_manager.js:14` — passes a third `turn` argument to `game.updateStateChangeSoc`,
      whose signature (`game.js:72`) takes two. Harmless; reads as unfinished. Accept it or drop it.

---

## 5. The four branch chains that are really lookup tables

This is the core "are we overcomplicating?" answer. All **LOW RISK** — mechanical, behavior-preserving,
and §2 covers them.

### 5.1 Map presets — written out five times (~90 lines -> ~15)

`index.js:57-115` is ~60 lines of nested if/else picking mapkey + size label. Then `index.js:174-182`
re-derives the same label with a second chain. Then `login.js:151-155`, `login.js:132` (nested
ternary), `waiting_room.js:161-167`. The five names already disagree in casing between files.

- [x] Add to `public/js/const.js`:
      ```js
      export const MAPS = {
        standard: { name: 'Standard',    mapkey: DEFAULT_MAPKEY,      min_players: 2 },
        extended: { name: 'Extended',    mapkey: DEFAULT_MAPKEY_5_6,  min_players: 5 },
        large:    { name: 'Large',       mapkey: DEFAULT_MAPKEY_7_8,  min_players: 7 },
        xlarge:   { name: 'Extra Large', mapkey: DEFAULT_MAPKEY_9_10, min_players: 9 },
        argentum: { name: 'Argentum',    mapkey: ARGENTUM_MAPKEY,     min_players: 2 },
      }
      ```
- [x] Replace all five sites. `login.js:132`'s `minIdx` ternary derives from `min_players`.

### 5.2 Player-count tiers

- [x] `models/game.js:73-89` — four branches differing only in deck / win_points / robber_hand_limit.
      ```js
      const PLAYER_TIERS = [
        { min: 9, deck: DECK_9_10, win_points: 13, robber_hand_limit: 10 },
        { min: 7, deck: DECK_7_8,  win_points: 12, robber_hand_limit: 10 },
        { min: 5, deck: DECK_5_6,  win_points: 11, robber_hand_limit: 8  },
        { min: 2, deck: DECK_STANDARD, win_points: 10, robber_hand_limit: 7 },
      ]
      const tier = PLAYER_TIERS.find(t => this.player_count >= t.min)
      ```

### 5.3 Dev card decks (~25 lines -> ~8)

- [x] `public/js/const.js:29-50` — four near-identical imperative builders. One
      `buildDeck({ knights, powers, vps })` called four times.

### 5.4 `DIR_HELPER` already exists — three copies were never deleted

The `@todo` at `const.js:80` is literally this finding.

- [x] `public/js/board/board.js:62-65` — inline `{tl:'top_left', …}` is `CONST.DIR_HELPER.KEYS`.
- [x] `public/js/board/tile.js:72-79` — `EDGE_2_CORNERS` is `CONST.DIR_HELPER.EDGE_TO_CORNERS`.
- [x] `public/js/board/board_shuffler.js:4-7` — `edge_shortcut` is `CONST.DIR_HELPER.MAPKEYS`.

---

**Done 2026-09-17.** Two deviations from the sketch above, both simpler:
- `MAPS` entries carry `max_players` (4/6/8/10/10) instead of `min_players`. The whole
  size rule becomes `max_players >= player_count`, which reproduces the old allowed-lists
  exactly and needs no index arithmetic in `login.js`.
- Custom (non-preset) mapkeys are now **always kept**. The old code silently replaced a
  hand-made map with a preset at 7+ players (it kept it at 5-6) - map-editor "Play this Map"
  lost the map. Helpers live in `const.js`: `MAP_LIST`, `mapOf`, `mapName`, `mapForPlayers`,
  `mapFitsPlayers`, plus `PLAYER_TIERS` / `playerTier` for §5.2.

`DIR_HELPER.OPPOSITES` is still unused and still has a typo (`left: 'r'`) - left for §6/dead-code.

---

## 6. Smaller simplifications

All **LOW RISK** unless noted.

- [x] `public/js/board/board_shuffler.js:68-77` and `:98-107` — the same 10 lines twice. Extract
      `adjacentNums(tile)`.
- [x] `models/game.js:815` and `:882` — both reach into Node internals for the remaining timer
      (`this.#timer._idleStart + this.#timer._idleTimeout`). Store `this.#timer_ends_at = Date.now() + ms`
      in `setTimer` instead.
- [x] `models/game.js:63-65` — `expected_actions.add` is monkeypatched onto an Array in the
      constructor. Works, but it's the one place in the file where a plain method would read better.
- [x] `public/js/ui/map_builder_board_ui.js:33-56` — verbatim copy of `board_ui.js:152-175` just to
      append one `<div class="tile-replace">`. Add a `tileExtraHtml()` hook to the parent and delete
      the copy. **MEDIUM RISK** — needs a visual check of the map editor.
- [x] `public/js/ui/board_ui.js:295-353` — the `touchstart` body is byte-identical to `resetTouch`,
      defined 40 lines below. Move `resetTouch` up and pass it directly. -16 lines.
- [x] `public/js/ui/trade_ui.js:119-135` — five identical switch cases (`S2`…`W2`). Same knowledge is
      re-encoded as a literal array at `:82` and `:185`, and the give-ratio is derived twice. One
      `#tradeRatio(type)` helper covers all three sites.
- [x] `public/js/waiting_room.js:8` — `joined_count` is stored state that is also derived in two
      other places. Delete the field, derive everywhere. Fixes the §4.5 double-count.
- [x] `public/js/waiting_room.js` — `window.io()` called eight times (`:45,68,75,90,99,107,142,215,236`).
      One `const socket = window.io()` in the constructor.
- [x] `public/js/waiting_room.js:115-152` — `closeColorPicker` / `openColorPicker` / `getTakenColors`
      are closures assigned in the constructor while every other member is a real method. They only
      use `this`; converting is mechanical.
- [x] `public/js/game.js:517-529` — robber/knight branches duplicated in both arms.
- [x] `public/js/game.js:249-250` — `findTile(id)` called twice.
- [x] `public/js/board/tile.js:46-53` — `ALL_CONNECTIONS` literal rebuilt for every corner of every
      tile. Hoist beside `OPPOSITES` at `:3`.
- [x] `public/js/ui/alert_ui.js:159-163` — `alertRollTurn`: both branches of the `if` are identical
      and `_has_shown_roll_alert` is written but never read.
- [x] `public/js/ui/player_ui.js:308-312` — `toggleDice`: `if (active) f(true) else f(false)`.
- [x] `public/js/ui/robber_drop_ui.js:146-154` — both branches set the same three `style.display`
      values with flipped constants.
- [x] `public/js/game.js:101-106` — if/else with identical shape; one call with a boolean.
- [x] `public/js/map-editor.js:629-693` and `:708-775` — `balanceNumbers()` / `balanceResources()`
      share three copy-pasted blocks. Extract `#resourceTiles()` and `#applyShuffle(mapkey, kind)`.
- [x] `public/js/map-editor.js:352-358` — `#resetBoardEdit()` resets the slider by dispatching a
      synthetic `input` event, forcing `onNumberSlider` to guard at `:392`. Call `onNumberSlider(6)`
      directly.
- [x] `_`-prefixed publics inside classes that otherwise use `#`: `models/game.js` (`_firstRoundRollPids`,
      `_dice`, `_endCleanupTimer`, `_godmode`), `player_ui.js:367,374,376`, `alert_ui.js:54-56,160`.
      Mechanical rename.
- [x] `models/game.js:704` — `#updateOngoingTrades(player)` is called with an argument it doesn't
      accept. Drop the argument.

---

## 7. Constants worth extracting

Only the ones with real drift risk — values that exist in two places and will diverge.

### JS

- [x] **`768` mobile breakpoint** — 5 JS sites (`player_ui.js:13,400`, `all_players_ui.js:28,132,153`)
      **and** ~12 CSS media queries. `CONST.MOBILE_MAX_WIDTH` fixes the JS half.
- [x] **localStorage keys** — `'status_history'`, `'status_history_gid'`, `'player-name'`,
      `'mute-notifications'`, `'all_players_compact'` as bare literals across 5 files.
      `board_ui.js:23` already does this right with `viewStorageKey` — follow that precedent.
- [x] **Trade ratios** — `CONST.PORTS_2_1` derives from `TRADE_OFFERS`; `models/game.js` uses it.
      `trade_ui.js` already derived its own via `#tradeRatio`, so it was left as is.
- [x] **Player range `2..10`, win points `5..20`** — four sites, two spellings
      (`[...Array(9).keys()]` vs `for(i=5;i<=20;i++)`).
- [x] **`6`/`8` red numbers** — five sites in `board_shuffler.js`.
- [x] **`7`** — the robber roll, `public/js/game.js:204`.
- [x] **Colour class count** — `{length: 11}` (`game.js:426`), `{length: 10}` (`waiting_room.js:128`),
      `/^pc\d+$/` (`all_players_ui.js:117`). Three spellings of the same fact; add an 11th colour and
      two of the three break. Ties into §9.
- [x] `public/js/game.js` timing numbers — clustered as a local `DELAYS` object. `240` became
      `CONST.REMATCH_SECONDS` instead, because `alert_ui.js` hardcoded the same number in markup.
- [x] `public/js/const.js:100-163` — the five mapkeys are ~65 lines of data in the middle of the
      constants file. Moving them to `const_maps.js` and re-exporting makes `const.js` readable.

### CSS (`public/css/constants.css`)

- [x] Card palette — `#ebd290` x12, border `#5a460e` x8 across 6 files. -> `--card-face`, `--card-border`.
- [x] Overlay scrim — `color-mix(in srgb, #3a3527 80%, transparent)` verbatim x5. -> `--overlay-bg`.
- [x] VP card background — `#c8b66d` x4.
- [x] Durations — `.25s` x40, `.5s` x22, `.15s` x16. -> `--t-fast/-base/-slow`.
- [x] `accessibility.css:347` `right: 240px` is hardcoded to `all-players.css:5` `width: 240px`.
      -> shared `--scoreboard-width`.
- [x] `waiting_room.css:538` `background: #2b70ff` is exactly `--player-2-color`.
- [x] **Colour drift, decided:** unified on `--sand-color` (`#e8d49c`); the two `#E9D49D` sites now
      use the token. 1/255 on two channels — not visible.
- [x] **Z-index scale** — the 9 cross-file layers are now `--z-hud/-hud-overlay/-animation/
      -accessibility/-panel/-alert/-board-overlay/-modal/-toast`. Values unchanged. Component-local
      values (`-2`..`5`, and the `-1`/`-10`/`-100` scrims) left alone — they are not a shared scale.

### Explicitly NOT worth constant-ising

`'hide'`, `'active'`, `'disabled'`, `'show'` — hundreds of uses, stable, and a `CLS.HIDE` constant
doesn't stop CSS from renaming the class. Pure indirection, no protection.

Same for converting `classList[bool ? 'add' : 'remove'](cls)` to `classList.toggle(cls, on)` —
`toggle(cls, undefined)` **flips** instead of removing, and several callers deliberately pass nothing
(`ui.js:170`, `trade_ui.js:210`). Low value, real trap.

---

## 8. CSS duplicate blocks

Done 2026-09-17. Verified with a throwaway probe page that mounts the affected markup and reads
`getComputedStyle` (sprite offsets, modal shells, title colours, `.p-name`, button reset all
unchanged), plus screenshots of login / waiting room / map editor. `npm test` green.

- [x] `index/trade.css` — five identical `.taking-card[data-type=X]::before` rules collapsed to one
      `&.taking-card::before`. Same specificity, still after the per-type rules, so it still wins.
- [x] `index/animations.css` — largest-army / longest-road `.title` blocks collapsed into
      `.animation-zone:is(.largest-army-animation, .longest-road-animation) .title`.
- [x] `index/robber-drop.css` + `index/res-selection.css` resource sprite offsets — moved into
      `resources.css` under one selector list. No new file; no other rule touches
      `background-position`/`-size` on those `::before`, so the cascade is unchanged.
- [x] `button {}` reset — new `public/css/base.css` with `button, .button`, imported last in
      `index.css`, `login.css`, `waiting_room.css`, `map-editor.css`. The four local copies are gone
      (map-editor's `.button` keeps its own look block).
- [x] `index/accessibility.css` — modal shell shared via `:is(.keyboard-shortcuts, .info-zone)`;
      each keeps only its own padding and extras.
- [x] `.p-name` now lives in `alert.css` only. `current-player.css` keeps just the status-bar
      `padding-left` and its mobile media query (both higher specificity, so they still win).
- [x] `index/all-players.css` — the three 200+ char selector lines are one selector per line.
- [x] The OG/Twitter meta block is now `views/meta.html`, pulled into the four views with
      `{{> meta}}`. Checked with a live render of `/`, `/login`, `/map-editor`.

Two duplicate blocks were left alone on purpose (dev-card sprite, primary buttons) — reasons in
[`TBD.md`](TBD.md) §6.

---

## 9. The `pN` / `pcN` unification — **DONE (2026-09-17)**

Solved by an indirection instead of a merge. `constants.css` now ends with a **player theme table**:
`.p0`-`.p10` then `.pc0`-`.pc10`, each defining `--p-color`, `--p-color-light`, `--p-color-dark`,
`--p-color-on-dark`, `--p-settlement` and `--p-city`. `pcN` is declared after `pN`, so with both
classes on an element the chosen colour wins; `pN` survives only as a fallback.

Every rule that used to be written out ten (or twenty) times now reads `var(--p-color)` once, and no
file outside `constants.css` names a `--player-N-color` any more. ~1300 lines of CSS deleted.

- [x] **9.1 Largest Army / Longest Road badge.** The badge `::after` now takes `var(--p-color)` from
      the panel it sits in, so `data-army`/`data-road` only decide *which* badge lights up, not its
      colour. No JS change needed.
- [x] **9.2 Incoming trade offers.** `trade_ui.js` emits `pc${color_id || id}`; `.request .text`
      takes its left border from `var(--p-color)`.
- [x] **9.3 LA/LR animations.** `animations.css` `.title` reads `var(--p-color, var(--sand-color-dark))`.
- [x] JS always emits `pcN` (`all_players_ui`, `waiting_room`, `trade_ui`, `const_messages`); the
      dead `id-N` class on the current player is gone.
- [x] The **22 `!important` declarations** in the mobile scoreboard are gone — one rule, no
      specificity fight. `.name { background: none }` lost its `!important` too.
- [x] Verified live with two players (localhost + 127.0.0.1 = two cookie jars) in a game where
      `color_id !== id` (Bob: id 2, colour 5), plus DOM injection for the cases a 2-player game
      can't reach. Computed styles checked, not just eyeballed: board settlement/city/road,
      scoreboard panel + name + LA/LR badge, action bar (including the `pc7` black-player
      `--p-color-on-dark` path), trade offer, LA/LR animation title, `.p-name` marker, end-game
      modal (winner colour beats the viewer's colour by nesting), waiting room, and the mobile
      scoreboard at 390x844. Console clean, 19/19 tests pass.

Notes for later:

- Board pieces are per-colour PNGs, so the table carries `--p-settlement`/`--p-city` as `url()`
  values. Adding an 11th colour means adding one row plus the two images.
- `.pN` is still used as a *structural* selector where a rule means "taken by some player"
  (`board.css` `.edge.taken`) or has to pair with an id-keyed attribute
  (`all-players.css` `[data-active]`/`[data-army]`/`[data-road]`). That is deliberate.

---

## 10. Visual verification (Playwright MCP) — **DONE (2026-09-17)**

No longer a plan: the harness exists, it ran, and it caught things. It lives in
**`tests/visual/`** — `README.md` is the runbook, `fixtures.js` the hooks you paste into
`browser_evaluate`. Screenshots and dumps land in `.playwright-mcp/` (now gitignored).

### How it works, in three lines

- `git worktree add /tmp/catan-base HEAD` and run it on `PORT=3001` next to the working tree on
  `3000`. Before and after are then two tabs, not two moments in time.
- Cookies are per **host**, not per port: `localhost` = Alice, `127.0.0.1` = Bob, one browser, two
  players. Entering through `/game/new?...` and `/login?game_id=…&name=…` sets the cookies, so no
  form filling. `config={"map_shuffle":"none"}` keeps the board fixed between runs.
- `VISUAL.build/trade/army/road/end` drive the UI through `window.game.*Soc()` — the same methods
  `socket_manager.js` calls — and `VISUAL.colours()` paints all 11 colours with `pcN !== pN`.
  `VISUAL.report()` dumps every resolved colour as JSON to `diff`.

### The finding that changed the method

**Gate on `VISUAL.report()`, not on screenshots.** Paired screenshots never come out
byte-identical (game key, turn timer, font loading), so a checksum gate is worthless. The report is
deterministic and says exactly which colour a class resolves to.

- [x] Harness validated on both trees, 1280x800 and 390x844, console clean (font-loading info only).
- [x] `diff report-base.json report-cur.json` over `pc0..pc10`: every row background, name colour
      and road colour **identical**. The only additions are the new `--p-color` /
      `--p-settlement` / `--p-city` custom properties from §9. ~1300 deleted CSS lines, same pixels.
- [x] §9.1 badges — baseline `pc3` army badge resolved to `#dc9f00` (colour **4**, its `pN`),
      `pc5` road badge to `#808080` (colour **6**). Now `#03a800` and `#8a2be2`, the chosen
      colours. Idle badges unchanged.
- [x] §9.2 trade offer — left border `rgb(43,112,255)` (id colour) before, `rgb(138,43,226)`
      (chosen colour) after.
- [x] §9.3 Largest Army title — banner was blue (id colour), now purple (chosen colour).
- [x] End-game modal was already correct at HEAD and still is: `pc5` purple, layout unchanged.
- [x] §6 `tileExtraHtml()` (the MEDIUM RISK item) — `/map-editor` renders pixel-for-pixel the same
      on both trees.
- [x] §4.1 — both trees keep `map_shuffle: none` when the game is *created* (same mapkey in the
      waiting room across four games). The difference shows at `Game.start()`: the baseline board
      no longer matches its own mapkey, the working tree's does. The bug and its fix, visible.

### Gotchas worth keeping

- `localStorage.clear()` before each capture set. `board_ui` stores pan/zoom per origin in
  `board-view`; a view saved at another window size makes the next run look broken for no reason.
  This cost one confusing "the board is zoomed in on baseline" detour.
- `browser_resize` applies to the current tab only — resize after selecting the tab, or screenshots
  come out at the old viewport.
- A city must be an upgrade (`Cannot Build City without Settlement`), a trade offer from yourself
  renders as an *ongoing* trade, requests carry `hide` outside `player_actions`, and the animation
  zone fades itself out ~950ms after it appears (`VISUAL.hold()` waits past that).

- [x] Longest Road animation — run manually through `VISUAL.road()` and watched end to end: correct.
      Slowest hook of the set, its own timeline is 6s (edges light up, card at 4s, title at 6s).

One thing stayed manual: drawing a map in the editor and playing it. See [`TBD.md`](TBD.md) §4.

---

## 11. Docs consolidation — **DONE (2026-09-17)**

**Risk: LOW.** Five docs with three different Node versions, three different prod URLs and the
architecture explained three times. Now three docs, each with one job.

| Doc | State |
|---|---|
| `README.md` | What the game is, how to run it, repo map, game states, mapkey DSL, status. |
| `DEPLOY.md` | **New.** Local run, `PORT` / `API_SALT`, Docker, VPS + Caddy + Cloudflare, gh-pages editor. Replaces `HOSTING_GUIDE.md`. |
| `WEBSOCKET_ARCHITECTURE.md` | Events, state machine, flows, invariants. Line refs re-verified. |
| `balanced-dice.md` | External write-up, now prefixed with an "in this repo" note. |
| `CODEBASE_DOCUMENTATION.md` | **Deleted** — unique content folded into `README.md`. |
| `HOSTING_GUIDE.md` | **Deleted.** |

- [x] `WEBSOCKET_ARCHITECTURE.md` — §11 rewritten from the current source (added the
      `expected_actions` gate, timer-driven transitions, god mode, `players` never compacted, the
      `SAVE_STATUS` → `innerHTML` trust hole; corrected the private-emit mechanism to
      `io.to(socket_id)`). Every `index.js` line ref in §1-§3, §7.1, §10 and §12 re-pointed at the
      322-line file — §7.1 claimed a `POST /login` that has never existed; all entry is `GET`.
- [x] Deleted `HOSTING_GUIDE.md`, wrote `DEPLOY.md` — Dockerfile, VPS, Caddy, `PORT` / `API_SALT`,
      and the warning that a deploy ends every game in progress.
- [x] Folded `CODEBASE_DOCUMENTATION.md` into `README.md` as "Repository map" + "Game states",
      then dropped it. Its `public/audio/`, `dev-static` and "Node v14+" claims died with it.
- [x] Fixed the onrender URLs in `README.md` (`catan.endea.ar` now, and the duplicated link block
      is gone). `public/js/map-editor.js:9` was already handled in §3.
- [x] Added the "in this repo" note to `balanced-dice.md` — names `models/dice.js`, both deviations
      (`avoidTotals` 7-protection, crypto RNG) and the `ROLL_DISTRIBUTION` broadcast.
- [x] README also picked up balanced dice / spectators / rematch in Features, `npm test`, and a
      corrected LOC line in Tech Debt.

---

## Deliberately NOT doing

Moved to [`TBD.md`](TBD.md) §6, with the comment-only follow-ups it asks for in §5.

---

## 12. Bugs found after the cleanup — **DONE (2026-09-18)**

§3-§9 were a review of code that existed then; these turned up later, while using the game. All of
them predate the cleanup - `git show HEAD:models/game.js` has the same lines. §12.1 and §12.2 came
from playing; §12.3, §12.4 and §12.5 were found while designing the stalemate check that ended up
not being built (§12.6).

### 12.1 A small hand-made map crashed the whole server — **FIXED (2026-09-17)**

Reported as "made a map, pressed Play, the map is not drawn". It is not a drawing bug: the server
process **exits**, so the page that was loading dies with it and every other game on the box goes
with it.

`models/game.js` `#expectedInitialBuild` picks a random legal corner when a player does not place
in time. On a map too small for the player count the board runs out of legal corners, so
`#getRandom([])` returns `undefined`, `findCorner(undefined)` returns `undefined`, and
`valid_edges.includes(...)` throws — inside the turn `setTimeout`, i.e. uncaught.

```
TypeError: Cannot read properties of undefined (reading 'includes')
    at #expectedInitialBuild (models/game.js:188)
    at #resolvePendingActions (models/game.js:177)
    at Timeout (models/game.js:797)
```

Three changes, smallest first:

- [x] `models/game.js` — when nothing legal is left, skip that player's placement and log, instead
      of throwing. The turn sequence continues and the process stays up.
- [x] `public/js/board/board.js` — new `Board.maxPlayers(mapkey)`. A settlement blocks its own
      corner plus at most three neighbours, so `legal corners / 4` placements always fit however
      badly they land, and each player needs two: `floor(corners / 8)`. Presets land far above
      their own `max_players` (standard 6, extended 8, large 11, xlarge 13), so only hand-made
      maps ever trip it.
- [x] `index.js` `/game/new` — refuses a map that cannot seat the requested players and redirects
      to `/login?notice=That map only fits N players.`
- [x] `public/js/map-editor.js` — the Players dropdown greys out the counts the current map cannot
      seat, relabelled "N (map too small)", so it never gets that far.

`tests/initial_build_test.js` covers all three: ten players on a five-tile map reach the first roll
instead of throwing, the standard map still places everyone, and no preset is ever blocked.

Same bug class as §4.5's `public/js/game.js:510` finding - `?.` guards the first call only, the
rest of the chain still runs on `undefined`. That review caught the client-side one and missed the
two in `models/game.js`:

- [x] `models/game.js` `#expectedRobberMove` — `findTile(tile_id)?.getAllCorners().filter(…)` then
      `opp_c_pids.length`. Same crash, same timer, reachable when the board has no robbable tile.
      Guarded with `|| []`. Unreachable in practice now that `Board.maxPlayers` refuses maps that
      small, so no test: the guard is there because the next tiny-map path should not find it.

### 12.2 Road Building can silently eat the card — **FIXED (2026-09-17)**

`#getRandom(valid_edges)` on an empty list returned `undefined`, and `board.build` ignores an
unknown edge (`findEdge(loc)?.buildRoad`). No crash, but the dev card was spent and one or both
roads never appeared. Same `?.`-guards-the-first-call-only class as §12.1.

Decided: refuse the card outright when nothing is legal, otherwise place what fits. A card that
buys one road is a bad turn; a card that buys nothing is a lost card.

- [x] `models/game.js` `roadBuildingIO` — compute the legal edges *before* `playedDevCard`, and
      return early when there are none, so the card stays in hand. The second road now only builds
      if an edge is still legal after the first one (the first road can take the last spot).
- [x] `public/js/game.js` `canPlayDevCard` — `dR` also needs a legal edge, so the card greys out
      instead of being clickable for a request the server refuses.

`tests/road_building_test.js`: the normal case still places both roads and spends the card; a
player with no road to extend from builds nothing and keeps the card, still playable that turn.

### 12.3 Any player could kill the server with one socket message — **FIXED (2026-09-18)**

`models/game.js` `clickedLocationIO` looked up a corner by a client-supplied id and dereferenced it
without checking:

```js
const corner = this.board.findCorner(id)
if (!corner.piece) {
```

`findCorner` is `#corner_refs[id]`, so any id outside the array — `9999`, `-1`, `null`, a string —
returned `undefined` and `.piece` threw. `models/io_manager.js:35` wires the raw client value in
untouched: `socket.on(SOC.CLICK_LOC, (loc_type, id) => game.clickedLocationIO(pid, loc_type, id))`.

socket.io calls listeners from a bare `process.nextTick` with no try/catch and `index.js` has no
`uncaughtException` handler, so the throw exited the process and took every other game on the box
with it. Same class as §12.1, but reachable on the preset map by anyone in any game, deliberately.

The EDGE branch was already safe: it tests `valid_locs.includes(id)` before it ever calls
`findEdge`, so a bad id just fails the membership check. Only the CORNER branch looked up first.

- [x] `models/game.js` `clickedLocationIO` — `if (!corner) return` immediately after the lookup.

`tests/click_location_test.js`: out-of-range, negative, `null`, `undefined`, a string and an object
are all ignored on both branches and build nothing; a legal corner still builds. That last case
needs the player to extend a road outward first — straight after setup both road ends sit next to
their own settlement, so the distance rule legitimately leaves no legal corner.

### 12.4 An abandoned game never stopped — **FIXED (2026-09-18)**

`socket.on('disconnect')` in `index.js:307` calls `removePlayerSocket`, not `removePlayer` — the
player stays in the game, just unreachable. Nobody acts, so every turn the timer fired,
`#resolvePendingActions` ran the `PLAYER_ACTIONS` callback, which only advances `active_pid`, and
`#next()` set a fresh timer. That loop had no exit: the session, its board and its timer lived until
the process restarted. This was the actual "server loops forever" symptom.

Decided: this ticket fixes it, not the stalemate check. That predicate requires an empty dev deck,
and timer auto-advance never buys a dev card, so an abandoned game always has a full deck and can
never be a stalemate. The two look similar and fix disjoint problems.

Decided: count turns, not `#next()` calls. `#next()` recurses when `auto_roll` is on, which would
double-count; `this.turn` advances exactly once per round however it is reached.

Decided: only when `config.timer` is on. Without a timer nothing advances a game on its own, so it
is a human who called `#next()` and somebody is by definition connected. The gate costs no coverage
and keeps headless tests, which have no sockets at all, from reaping themselves mid-run.

- [x] `models/game.js` — `#idle_from_turn` field and `#isAbandoned()` beside `#getRandom`: reset the
      marker whenever a spectator or a non-removed player still holds a socket, and report true
      three full rounds after the last one went away. Three rounds, not two, so a refresh or a flaky
      connection has room to come back.
- [x] `models/game.js` `#next()` — `if (this.#isAbandoned()) { return this.#onGameEnd(this.id) }`
      right after `#resolvePendingActions`. No `end_context`, no `updateGameEnd`: nobody is
      listening. `clearTimer()` has already run at the top of `#next()`, so the loop stops dead.

### 12.5 Two winners announced in the same tick — **FIXED (2026-09-18)**

In `build()` the Longest-Road break check (:642) runs *before* `player.addPiece` (:646). Both can
push a player past `win_points`: `#checkLongestRoad({ broken_pid })` hands Longest Road — and its
2 VP — to a third player, then `addPiece` gives the builder their settlement VP. Each call reached
`#onPlayerVpChange`, which scheduled its own 200 ms `setTimeout`; both fired, both overwrote
`this.end_context`, and both emitted `updateGameEnd` with a different winner.

Decided: a synchronous latch. An `if (this.end_context) return` inside the timeout body would also
work — the two timeouts run one after the other, so the first assigns `end_context` before the
second body starts — but latching up front is the same two lines and never schedules the second
timeout at all. First past the post wins.

- [x] `models/game.js` — `#ending` field beside `end_context`; `#onPlayerVpChange` returns when it
      is set and sets it before scheduling. A rematch builds a fresh `Game`, so it never needs
      resetting.

`tests/game_lifecycle_test.js` covers §12.4 and §12.5 together: a game nobody is connected to reaps
itself within a few rapid rounds while an otherwise identical one with a single live socket keeps
taking turns, and two players crossing `win_points` in the same tick produce exactly one `GAME_END`
broadcast with the first of them as the winner.

### 12.6 A board nobody can build on never ends the game — **moved to [`TBD.md`](TBD.md) §3.1**

Designed in full on 2026-09-18 and deliberately not built. It is a hand-made-map-only feature — a
soak fired the predicate 0/25 times on the preset map and 6/25 on a tiny one — and it cannot fix the
loop that prompted it, which was §12.4. The design, the three decisions behind it and the reasoning
that was rejected are all in `TBD.md`; nothing is lost by it leaving this file.

---

## 13. Trade requests: withdraw, and mobile touch targets — **DONE (2026-09-18)**

A player-trade request had no exit. Every piece for one was already in the tree and none of them
were connected: a `Withdraw` span with an empty handler, a `deleted` status in the `updateOngoing`
JSDoc that nothing ever set, `.og-request.deleted { display: none }`, and a client-side request
limit that already counted `:not(.deleted)`. The CSS that would have shown the link was commented
out, so it had never been visible either.

Scope note: **Counter** was left alone. Its `@todo` claims "the server already takes a counter_id",
which is true of the argument and false of the behaviour — `tradeRequestIO` never reads it, and
`#canAct` refuses a non-active pid before it could. Rules for it were settled on 2026-09-18 and are
written up in [`TBD.md`](TBD.md) §2.

- [x] `models/game.js` `tradeResponseIO` — the requester responding to their own request sets
      `status: 'deleted'` and broadcasts. Withdrawing costs nothing and frees the slot.
- [x] `models/game.js` `tradeResponseIO` — `if (status !== 'open') return`. **A settled request
      could be accepted again**: `status` was set to `success` and nothing refused a second taker,
      so two players accepting the same offer both traded and the requester paid twice. The UI hid
      the request after the first accept, so it needed a race or a crafted socket message — nothing
      on the server said no. Same guard closes accepting a withdrawn one.
- [x] `models/game.js` `tradeRequestIO` — the `max_trade_requests` count excludes deleted requests.
      It had drifted from the client, which already excluded them.
- [x] `public/js/game.js` `updateOngoingTradesSoc` — dropped the `status !== 'deleted'` filter that
      stopped a withdrawal from ever reaching the UI.
- [x] `public/js/ui/trade_ui.js` — the Withdraw control calls `#onTradeResponse(id)`, and is now a
      real `<button>` (it was a `<span>`, so it could not take focus).
- [x] `public/css/index/trade.css` — Withdraw wears the same pill as `.confirm` / `.counter`
      (50px radius, 2px border, `--font-main`) in `--trade-negative`, and fills solid on
      hover/focus. Shown only while the request is `open`, so it disappears the moment a trade
      lands — there is no undo after a trade, by design.
- [x] `public/css/index/trade.css` — touch targets at 390px: Withdraw 49×11 -> 91×40 in a 44px row,
      Accept 74×27 -> 97×47, Ignore 55×20 -> 76×43. Desktop is untouched (the row is still 22px and
      Withdraw sits where it did).

**The trap worth remembering:** the first version of the touch rules did nothing. They went into the
`@media` block at the *top* of `.ongoing`, while the base `.og-request` declarations sit ~80 lines
below it. A media query adds no specificity, so source order handed the win back to the base rules —
`display: flex` applied because the base does not set it, `min-height` and the padding did not. Both
touch blocks now sit *after* the rules they override, with a comment saying why. Same hazard the
"Deliberately NOT doing" note describes for the tail-appended override sections.

`tests/trade_test.js`, 5 cases: withdraw keeps your cards, withdraw frees a slot, a withdrawn
request cannot be accepted, you cannot accept your own request, a successful trade cannot be
accepted twice. All five fail with the guard removed. Suite: 31/31.

Checked in a real two-player game at 1280x800 and 390x844 (recipe in `tests/visual/README.md`):
request posted, Withdraw visible and clicked, row `deleted` and hidden, the other player's card
hidden, an accept attempt after the withdrawal moved nothing, both hands intact. No console errors.
Screenshots in `.playwright-mcp/` (`withdraw-*`, `touch-*`, `btn-*`).
