# Visual checks (Playwright MCP)

`npm test` covers game logic and cannot see a pixel. This is the other half: a scripted way to put
the UI into the states that CSS work can break, screenshot them, and diff the colours as text.

Exercised end to end on 2026-09-17 against `HEAD` vs the working tree, over that day's CSS dedupe
and `pN`/`pcN` colour-class work. Everything below is a recipe that ran, not a plan.

## 1. Two servers, so "before" and "after" are side by side

```bash
git worktree add /tmp/catan-base HEAD          # the "before" tree, untouched
ln -s "$PWD/node_modules" /tmp/catan-base/node_modules
(cd /tmp/catan-base && PORT=3101 node index.js) &   # before
PORT=3100 node index.js &                           # after (the working tree)
```

Plain `node`, not `npm start`: nodemon restarting mid-capture loses the game.
When the run is over, `git worktree remove /tmp/catan-base`.

## 2. One browser, two players

Players are the `game_id` / `player_id` cookies, and **cookies ignore the port** - they are per
host. So `localhost` and `127.0.0.1` are two cookie jars and one browser drives two players, but
`localhost:3100` and `localhost:3101` are the *same* jar: finish one server before starting on the
other, and re-enter through the URLs below, which always set fresh cookies.

Everything is a URL, no form filling:

```
tab 0  http://localhost:3100/game/new?name=Alice&players=2&config=%7B%22map_shuffle%22%3A%22none%22%7D
tab 1  http://127.0.0.1:3100/login?game_id=<id>&name=Bob
```

`/game/new` redirects to `/game/<id>` - read the id out of the URL. `map_shuffle: none` keeps the
board identical between runs, so a screenshot pair differs only where the CSS does.

Then, in tab 1, give Bob a colour that is **not** his id colour - `pcN !== pN` is where every colour
bug the player theme table fixed lived:

```js
browser_click('.slot.filled[data-pid="2"] .city-icon')   // opens the picker
browser_click('.color-option[data-id="5"]')              // Bob: id 2, colour 5
```

Back in tab 0, `browser_click('#start-game-btn')`.

**Before each capture set, wipe the origin's storage:** `localStorage.clear(); location.reload()`.
`board_ui` remembers pan and zoom per origin in `board-view`, and a view saved at another window
size makes the next run's board look broken for reasons that have nothing to do with the change.

## 3. The fixtures

Paste all of `fixtures.js` as the `function` argument of `browser_evaluate` on an in-game page. It
returns the hook names and installs `window.VISUAL`; after that one hook per call:

| Hook | What it puts on screen |
|---|---|
| `VISUAL.build()` | settlements, cities and roads for both players |
| `VISUAL.trade()` | an incoming trade offer; reports the row colour, how many offers are on screen and the list's share of the viewport height (the phone cap is 35%) |
| `VISUAL.army()` | the Largest Army award; resolves when its banner is in (it stays ~2s, so screenshot right away) |
| `VISUAL.road()` | the Longest Road award; resolves when its banner is in (it stays ~2.2s) |
| `VISUAL.end()` | the end-game modal, with a `dVps` map in its context; reports the row count, whether the first row is `.winner`, whether every row's parts add up to its total, any `.end-tab` or placeholder text, the table's sideways / inner scroll, page overflow, whether the winner row, `.vote-rematch` and `.rematch-timer` sit fully inside the viewport, and whether "Results" is on the status bar |
| `VISUAL.colours()` | the scoreboard and the board pieces swept through all 11 colours |
| `VISUAL.report()` | every resolved colour as JSON, for `diff` |
| `VISUAL.cards()` | every visible `.card`: location, box, ratio (586/873 = 0.671) and resolved image |
| `VISUAL.scoreboard()` | scoreboard geometry: per row height, name width, tile count, overflow; panel bottom vs dock top, height share, smallest count font |
| `VISUAL.hand(cards?)` | the viewer's hand filled (default: five resources, several dev cards); `hand({})` empties it |
| `VISUAL.menu()` | opens the options menu and reports it: label / state / key hint / tap size per item, items without a label, lines the list takes, whether recenter is reachable with the menu closed |
| `VISUAL.history()` | fills the history (Setup build, two turns with rolls, a trade, one long status), opens the sheet and reports it: rect and viewport share, overlap with the scoreboard and the dock, status text on one line, History control hit size, turn headers and the entries under each |
| `VISUAL.tradeDrawer(mode?)` | opens the trade drawer in `'players'` (default) or `'bank'` mode and reports it: rect and viewport share, whether it stays on screen, how many scoreboard rows it covers, page/drawer overflow, smallest hit box across the cards and the deal's chips, the hand as the give row (per stack: cards, bank rate, glow, disabled, `tabIndex`; smallest stack hit box), what is staked, the guide line and the submit button's label and state |
| `VISUAL.discard(cards?)` | a hand of 14 resources (7 to discard) and the robber drop state through `updateStateChangeSoc()`; reports the discard drawer (see `drawer`), whether the big alert is up over it, and the glowing hand stacks on screen (the drawer has no cards of its own) |
| `VISUAL.picker(type?)` | Year of Plenty (`'dY'`, default) or Monopoly (`'dM'`) through `game.onDevCardActivate()`, with the least state that lets `canPlayDevCard` pass; reports the picker (see `drawer`) |
| `VISUAL.drawer(sel)` | one resource drawer: rect and viewport share, on screen, alert shown, page/drawer overflow, overlap with the dock, dock and timer on screen, smallest hit box, resources on screen, title, counter, guide and the submit button's label, state and visibility |
| `VISUAL.dock()` | dock geometry: height and viewport share, hand cards above the dock top, tap size (grown `::after` included) / label / accessible name per action, dock height with an empty vs a full hand |
| `VISUAL.editor()` | the map editor (`/map-editor`, no game): dock and rail boxes, whether they overlap or scroll the page, the board's share of the viewport, smallest tap size, the brushes and numbers on the dock, the four rim phantoms, the coastline (per tile, land-owned against sea-owned, double-drawn edges, variants in use), the port popover opened on a real port tile, the Map info sheet (terrain bars and the dice-number bars) and the game-setup modal. Takes an optional mapkey to render first |
| `VISUAL.lobby()` | `/login` or the waiting room (no game needed): contrast of every visible text in the card, the tabs and the game-key header (`failing` lists those under 4.5:1, or 3:1 from 24px; the translucent card is composited over black and over white, the artwork's two worst cases; disabled controls are listed, not gated), page scroll, and per page: the tab, notices and whether they sit in the card, the four selects' boxes, title size against the name input, "Start Game" inside the viewport; or each slot's height (`me` marks your own), whether the list scrolls, Start / Leave inside the viewport and the settings' boxes |
| `VISUAL.reset()` | reload, back to server state |

`army`, `road` and `end` return promises - `browser_evaluate` awaits them, so the call returns when
the thing is on screen and the screenshot that follows catches it.

The state hooks call `window.game.*Soc()`, the same methods `socket_manager.js` calls, so the UI
goes through its real code path. They are **client-side only**: the server does not learn about
them, and a reload undoes everything.

### The lobby

`VISUAL.lobby()` runs on the login page and the waiting room. Entry URLs, all without form filling:

```
/login                                   Host form
/login?notice=That%20map%20only%20fits%204%20players.
/login?game_id=<id>&name=Bob             joins <id> as Bob (another cookie jar per player)
/login?game_id=<id>                      Join tab, key prefilled
/login?game_id=<id>&full=1               game-full message with Back / Spectate
/game/new?name=Alice&players=10          ten-seat waiting room, you are the host
```

Gate on `failing` being empty at all five viewports, the four selects sharing `x`, `w` and `h`,
`title.px <= nameInputPx`, `primary.inView` at 360x640 and 640x360, and in a ten-seat room at
1280x650 every slot `inView`, the `me` slot taller than the rest and at least 44px, `start` and
`leave` in view.

## 4. What to capture, at both widths

`browser_resize` to **1280x650** and **390x844** (the `768px` breakpoint is in both JS and CSS). For
type, button, panel or card work, the full set: **1280x650, 390x844, 360x640, 844x390, 640x360**.

1. waiting room with the colour picker open
2. board with pieces - after `build()`
3. incoming trade offer - after `trade()`
4. Largest Army / Longest Road animation - after `army()` / `road()`
5. all 11 colours on scoreboard + board - after `colours()`
6. end-game modal - after `end()`
7. `/map-editor` - its own page, no game needed; see the runbook below

Also worth a look while the browser is open: `browser_console_messages` (a clean run only reports
font loading), and building a map in the editor, then playing it, to confirm the board matches.

### The map editor

`/map-editor` has no game behind it, so open it on its own, paste `fixtures.js`, and call
`VISUAL.editor()`. **Do the full five viewports** - 1280x650, 390x844, 360x640, 844x390, 640x360 -
because the rail turns from a column into a strip at 768px wide and the dock stops wrapping at
480px tall, and clear `localStorage` between them (`board_ui` remembers pan and zoom per origin).

Gate on the report, in this order:

- `chrome.overlap` and `chrome.hScroll` false at every viewport, and `chrome.boardShare` the
  larger part of the screen.
- `taps.min` at least 44 at every viewport, including the landscape ones over 768px wide.
- `rim.sides` all four, and each rim button 44px on screen whatever the zoom - they live inside
  the board and divide its scale back out.
- `coast.doubleDrawn` zero, and more than one entry in `coast.variants`.
- `port.coversSubject` false: the popover is anchored beside its tile, not over it.
- `info.dice` ten columns, 7 absent, the 6 and the 8 flagged `red`, the tallest `fill` at 100%,
  and the counts adding up to the numbered land in `info.facts`.
- `gameSetup.shown` true, with `gameSetup.seats` saying what the map can seat.
- `float.clearOfDock`, `float.clearOfRail` and `float.inView` all true: undo and redo hover over
  the board, never under the chrome.
- every entry in `toggles` carries a `mark` - the ring or the tick is what says on or off, and a
  chip without one is just a button.

Two maps are worth the pass, both through `VISUAL.editor(mapkey)`:

```js
VISUAL.editor()                                            // the default map: coast all on sea
VISUAL.editor('G6.J8.C5\n-F4.D.M10.G2\n-J3.M9.F12.C11')    // land to the rim: coast all on land
```

The second is the case the land-side coast exists for, and it should also report
`flagged: [...]` for the touching 6 and 8.

By hand, at 390x844 and with a finger rather than a mouse, because none of it is in the report:

1. pick a terrain brush, tap a sea tile, then drag across several - every tile the finger enters
   takes the brush, and one undo takes the whole drag back;
2. pick the eraser (the `Erase` chip) and drag back over them;
3. with `Pan` selected, drag - the board moves and nothing is painted; pinch - it zooms and
   nothing is painted. On a keyboard, holding Space does the same without putting the brush
   down, and the brush is back in hand on release;
4. tap a sea tile with the `Port` brush, pick a type, then tap one of the six edges of the
   hexagon in the popover;
5. tap each of the four rim `+` buttons; the map grows on that side and nothing else moves;
6. with the `Random` number chip selected, paint a run of land - every tile comes out with a
   different number, and dragging back over one does not re-roll it.

Then press Back: it should leave the editor, not undo an edit. Editing writes no history entry.

## 5. Comparing

**Gate on the report, not on the images.** `VISUAL.report()` resolves every player colour into
plain strings; `browser_evaluate`'s `filename` writes it to a file:

```
browser_evaluate(fn = VISUAL.report(), filename = '.playwright-mcp/report-base.json')   # on :3101
browser_evaluate(fn = VISUAL.report(), filename = '.playwright-mcp/report-cur.json')    # on :3100
diff .playwright-mcp/report-base.json .playwright-mcp/report-cur.json
```

Run it right after `colours()` so all 11 rows exist, and again once the animation, the trade offer
and the modal are on screen if those matter for the change in hand.

Screenshots are for the eyes only. **Paired screenshots never come out byte-identical** - the game
key, the turn timer and font loading all move - so do not try to gate on a checksum.

## 6. Gotchas found while building this

- A city has to be an upgrade: `updateBuildSoc(pid, 'C', loc)` on an empty corner throws
  `Cannot Build City without Settlement`.
- A trade offer from *yourself* renders as an ongoing trade, not as a request. The hooks default to
  an opponent for that reason.
- Trade requests carry `hide` outside the `player_actions` state; `VISUAL.trade()` strips it.
- Awards (Largest Army, Longest Road) play in their own layer, `#game > .award-zone`, one after the
  other, and their banner stays ~2s. `VISUAL.army()` / `VISUAL.road()` resolve once it is in:
  screenshot right away.
- The Largest Army / Longest Road badges key off `data-army` / `data-road` matching a row's
  `data-id`, not its colour class.
