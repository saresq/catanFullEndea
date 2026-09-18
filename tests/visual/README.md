# Visual checks (Playwright MCP)

`npm test` covers game logic and cannot see a pixel. This is the other half: a scripted way to put
the UI into the states that CSS work can break, screenshot them, and diff the colours as text.

Exercised end to end on 2026-09-17 against `HEAD` vs the working tree (todo.md §3-§9). Everything
below is a recipe that ran, not a plan.

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
bug in §9 lived:

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
| `VISUAL.trade()` | an incoming trade offer (§9.2) |
| `VISUAL.army()` | the Largest Army animation, parked on screen (§9.3) |
| `VISUAL.road()` | the Longest Road animation, parked on screen (§9.3) |
| `VISUAL.end()` | the end-game modal |
| `VISUAL.colours()` | the scoreboard and the board pieces swept through all 11 colours |
| `VISUAL.report()` | every resolved colour as JSON, for `diff` |
| `VISUAL.reset()` | reload, back to server state |

`army`, `road` and `end` return promises - `browser_evaluate` awaits them, so the call returns when
the thing is on screen and the screenshot that follows catches it.

The state hooks call `window.game.*Soc()`, the same methods `socket_manager.js` calls, so the UI
goes through its real code path. They are **client-side only**: the server does not learn about
them, and a reload undoes everything.

## 4. What to capture, at both widths

`browser_resize` to **1280x800** and **390x844** (the `768px` breakpoint is in both JS and CSS).

1. waiting room with the colour picker open
2. board with pieces - after `build()`
3. incoming trade offer - after `trade()`
4. Largest Army / Longest Road animation - after `army()` / `road()`
5. all 11 colours on scoreboard + board - after `colours()`
6. end-game modal - after `end()`
7. `/map-editor` (its own page, no game needed)

Also worth a look while the browser is open: `browser_console_messages` (a clean run only reports
font loading), and building a map in the editor, then playing it, to confirm the board matches.

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
