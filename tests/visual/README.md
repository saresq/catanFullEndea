# Visual checks (Playwright MCP)

`npm test` covers game logic and cannot see a pixel. This is the other half: a scripted way to put
the UI into the states that CSS work can break, screenshot them, and diff the colours as text.

Exercised end to end on 2026-09-17 against `HEAD` vs the working tree, over that day's CSS dedupe
and `pN`/`pcN` colour-class work. Everything below is a recipe that ran, not a plan.

## 1. Two servers, so "before" and "after" are side by side

```bash
git worktree add /tmp/catan-base HEAD          # the "before" tree, untouched
ln -s "$PWD/node_modules" /tmp/catan-base/node_modules
(cd /tmp/catan-base && PORT=3001 node index.js) &   # before
PORT=3000 node index.js &                           # after (the working tree)
```

Plain `node`, not `npm start`: nodemon restarting mid-capture loses the game.
When the run is over, `git worktree remove /tmp/catan-base`.

## 2. One browser, two players

Players are the `game_id` / `player_id` cookies, and **cookies ignore the port** - they are per
host. So `localhost` and `127.0.0.1` are two cookie jars and one browser drives two players, but
`localhost:3000` and `localhost:3001` are the *same* jar: finish one server before starting on the
other, and re-enter through the URLs below, which always set fresh cookies.

Everything is a URL, no form filling:

```
tab 0  http://localhost:3000/game/new?name=Alice&players=2&config=%7B%22map_shuffle%22%3A%22none%22%7D
tab 1  http://127.0.0.1:3000/login?game_id=<id>&name=Bob
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
| `VISUAL.trade()` | an incoming trade offer |
| `VISUAL.army()` | the Largest Army animation, parked on screen |
| `VISUAL.road()` | the Longest Road animation, parked on screen |
| `VISUAL.end()` | the end-game modal |
| `VISUAL.colours()` | the scoreboard and the board pieces swept through all 11 colours |
| `VISUAL.report()` | every resolved colour as JSON, for `diff` |
| `VISUAL.cards()` | every visible `.card`: location, box, ratio (586/873 = 0.671) and resolved image |
| `VISUAL.scoreboard()` | scoreboard geometry: per row height, name width, tile count, overflow; panel bottom vs dock top, height share, smallest count font |
| `VISUAL.hand(cards?)` | the viewer's hand filled (default: five resources, several dev cards); `hand({})` empties it |
| `VISUAL.menu()` | opens the options menu and reports it: label / state / key hint / tap size per item, items without a label, lines the list takes, whether recenter is reachable with the menu closed |
| `VISUAL.history()` | fills the history (Setup build, two turns with rolls, a trade, one long status), opens the sheet and reports it: rect and viewport share, overlap with the scoreboard and the dock, status text on one line, History control hit size, turn headers and the entries under each |
| `VISUAL.dock()` | dock geometry: height and viewport share, hand cards above the dock top, tap size (grown `::after` included) / label / accessible name per action, dock height with an empty vs a full hand |
| `VISUAL.editor()` | the map editor (`/map-editor`, no game): dock and rail boxes, whether they overlap or scroll the page, the board's share of the viewport, smallest tap size, the brushes and numbers on the dock, the four rim phantoms, the coastline (per tile, land-owned against sea-owned, double-drawn edges, variants in use), the port popover opened on a real port tile, the Map info sheet (terrain bars and the dice-number bars) and the game-setup modal. Takes an optional mapkey to render first |
| `VISUAL.reset()` | reload, back to server state |

`army`, `road` and `end` return promises - `browser_evaluate` awaits them, so the call returns when
the thing is on screen and the screenshot that follows catches it.

The state hooks call `window.game.*Soc()`, the same methods `socket_manager.js` calls, so the UI
goes through its real code path. They are **client-side only**: the server does not learn about
them, and a reload undoes everything.

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
browser_evaluate(fn = VISUAL.report(), filename = '.playwright-mcp/report-base.json')   # on :3001
browser_evaluate(fn = VISUAL.report(), filename = '.playwright-mcp/report-cur.json')    # on :3000
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
- The animation zone fades itself back out ~950ms after it appears. `VISUAL.hold()` waits past that
  and removes `finish`.
- The Largest Army / Longest Road badges key off `data-army` / `data-road` matching a row's
  `data-id`, not its colour class.
