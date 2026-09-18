/**
 * Visual-check fixtures. Not a test - a set of hooks for the runbook in ./README.md.
 *
 * Paste this whole file as the `function` argument of Playwright MCP `browser_evaluate`
 * while an in-game page (`/game/<id>`) is open. It installs `window.VISUAL` and returns
 * the list of hooks. Then call one hook per `browser_evaluate`, screenshot, move on.
 *
 * Two kinds of hooks:
 *  - state hooks (build/trade/army/road/end) go through `window.game.*Soc()`, the exact
 *    methods `socket_manager.js` calls, so the UI reaches a real state, not a faked DOM;
 *  - paint hooks (colours) rewrite classes only, to sweep all 11 player colours without
 *    needing 11 players. They always set `pcN !== pN`, which is the case the `pN`/`pcN`
 *    colour bugs lived in (unified 2026-09-17).
 *
 * Nothing here is reachable from the app: it lives in tests/ and is never served.
 */
() => {
  const game = window.game
  if (!game) return 'no window.game - open /game/<id> first'

  const $$ = sel => [...document.querySelectorAll(sel)]
  const free = sel => $$(sel).filter($_ => !$_.classList.contains('taken')).map($_ => $_.dataset.id)
  /** Someone other than the viewer - an offer from yourself renders as an ongoing trade instead. */
  const other = game.opponents?.[0]?.id || 2

  const VISUAL = {
    /**
     * Settlements, cities and roads on the board for `pids`, straight through the build event.
     * A city has to be an upgrade - the board model rejects `C` on an empty corner.
     */
    build(pids = [1, 2], per = 3) {
      const corners = free('.corner'), edges = free('.edge')
      let c = 0, e = 0
      pids.forEach(pid => {
        for (let i = 0; i < per; i++) {
          const loc = corners[c += 7]
          game.updateBuildSoc(pid, 'S', loc)
          if (i === 1) { game.updateBuildSoc(pid, 'C', loc) }
          game.updateBuildSoc(pid, 'R', edges[e += 5])
        }
      })
      return { corners_left: free('.corner').length, edges_left: free('.edge').length }
    },

    /**
     * Incoming trade offer from another player. Requests render with `hide` outside
     * the `player_actions` state, so drop it - the offer is what we came to look at.
     */
    trade(pid = other, id = 'visual-1') {
      game.requestTradeSoc(pid, { id, giving: { W: 2, S: 1 }, asking: { B: 1 } })
      const $req = document.querySelector(`.request[data-id="${id}"]`)
      $req?.classList.remove('hide')
      return $req ? getComputedStyle($req.querySelector('.text')).borderLeftColor : 'no request'
    },

    /**
     * Largest Army animation. `game.js` defers it 2s, then `animations_ui` fades it out
     * again 950ms later by adding `finish`. Both hooks below wait past that and strip `finish`,
     * which parks the animation on screen so a screenshot can catch it - awaiting the returned
     * promise is what `browser_evaluate` does anyway.
     */
    army(pid = other, count = 3) {
      game.updateLargestArmySoc(pid, count)
      return VISUAL.hold(3400)
    },

    /** Longest Road animation. Its own timeline is longer: content at 4s, `start` at 6s. */
    road(pid = other, locs) {
      game.updateLongestRoadSoc(pid, locs || $$('.edge.taken').map($_ => ({ id: $_.dataset.id, type: 'e' })).slice(0, 5))
      return VISUAL.hold(7000)
    },

    /** Park whatever is in the animation zone on screen, `after` ms from now. */
    hold(after = 0) {
      const $z = document.querySelector('#game > .animation-zone')
      return new Promise(res => setTimeout(() => {
        $z.classList.remove('finish')
        $z.classList.add('start')
        res({ zone: $z.className, title: $z.querySelector('.title')?.className })
      }, after))
    },

    /** End-game modal (`alert.css .game-ended.pcN`). `game.js` defers it 3s; await the promise. */
    end(pid = other, color_id = 5) {
      game.updateGameEndSoc({ pid, color_id, vps: 10, S: 3, C: 2, dVp: 1, largest_army: 3, longest_road: 6 })
      return new Promise(res => setTimeout(() => res(document.querySelector('.game-ended')?.className || 'no modal'), 3400))
    },

    /**
     * Paint the scoreboard and the board pieces through all 11 colours, id colour != chosen
     * colour on purpose. Pure DOM: reload the page to undo.
     */
    colours() {
      const $panel = document.querySelector('.all-players')
      const $rows = $$('.all-players .player')
      while (document.querySelectorAll('.all-players .player').length < 11) {
        $panel.appendChild($rows[0].cloneNode(true))
      }
      $$('.all-players .player').forEach(($p, i) => {
        $p.className = `player p${(i % 10) + 1} pc${i}`
        $p.dataset.id = i + 1
        $p.querySelector('.name').textContent = `pc${i}`
      })
      // The badges key off `data-id`, not off the colour class: row `pc3` is `data-id="4"`.
      $panel.dataset.army = '4'
      $panel.dataset.road = '6'

      $$('.corner').slice(0, 22).forEach(($c, i) => {
        $c.className = `corner taken p${(i % 10) + 1} pc${i % 11}`
        $c.dataset.taken = i % 2 ? 'C' : 'S'
      })
      $$('.edge').slice(0, 22).forEach(($e, i) => {
        $e.className = `edge taken p${(i % 10) + 1} pc${i % 11}`
      })
      return 'scoreboard + board painted pc0..pc10'
    },

    /**
     * Text snapshot of every colour a player class resolves to, for `diff` instead of eyes.
     * Run it after `colours()`; `browser_evaluate`'s `filename` writes it straight to a file,
     * so the before/after check is `diff report-before.json report-after.json`.
     */
    report() {
      const of = ($el, ...props) => $el ? props.map(p => getComputedStyle($el).getPropertyValue(p).trim()).join(' | ') : 'absent'
      const after = $el => $el ? getComputedStyle($el, '::after').backgroundColor : 'absent'
      const out = {}
      $$('.all-players .player').forEach($p => {
        const pc = $p.className.match(/pc\d+/)[0]
        out[`row.${pc}`] = of($p, '--p-color', 'background-color')
        out[`row.${pc}.name`] = of($p.querySelector('.name'), 'color', 'background-color')
        // The badge colour lives on `::after`, and only the row named by `data-army`/`data-road`
        // lights up - that pair is the whole of the badge colour fix.
        out[`row.${pc}.army`] = after($p.querySelector('.largest-army'))
        out[`row.${pc}.road`] = after($p.querySelector('.longest-road'))
      })
      $$('.corner.taken').forEach($c => {
        const pc = $c.className.match(/pc\d+/)?.[0]
        if (pc && !out[`corner.${pc}`]) out[`corner.${pc}`] = $c.dataset.taken + ' ' + of($c, '--p-settlement', '--p-city')
      })
      $$('.edge.taken').forEach($e => {
        const pc = $e.className.match(/pc\d+/)?.[0]
        if (pc && !out[`edge.${pc}`]) out[`edge.${pc}`] = of($e, '--p-color', 'background-color')
      })
      out['animation.title'] = of(document.querySelector('#game > .animation-zone .title'), 'color', 'background-color')
      out['trade.request'] = of(document.querySelector('.request .text'), 'border-left-color')
      out['alert'] = of(document.querySelector('#game > .alert'), '--p-color')
      out['end.modal'] = of(document.querySelector('.game-ended .player-name'), 'color', 'background-color')
      return out
    },

    /**
     * Every visible card: where it is, its box, its ratio (must be 586/873 = 0.671; the trade drawer's
     * half cards are 1172/873 = 1.343) and the image it resolves to. The face is on `::before` for
     * `.card--under` and on `.card-front::before` for `.card--flip`.
     */
    cards() {
      const img = ($el, pseudo) => getComputedStyle($el, pseudo).backgroundImage.replace(/^url\("?[^/]*\/\/[^/]+|"?\)$/g, '')
      return $$('.card').filter($c => $c.offsetWidth && $c.checkVisibility?.({ visibilityProperty: true }) !== false).map($c => {
        // Computed size, not offset*/rects: fractional, and blind to the knights' rotation
        const cs = getComputedStyle($c), w = parseFloat(cs.width), h = +parseFloat(cs.height).toFixed(2)
        const $front = $c.querySelector(':scope > .card-front')
        return {
          where: $c.closest('#game > *, .animation-zone')?.className.split(' ')[0] || '?',
          card: $c.dataset.card || $c.dataset.type,
          w, h, ratio: +(w / h).toFixed(3),
          image: $front ? img($front, '::before') : img($c, $c.classList.contains('card--under') ? '::before' : null),
        }
      })
    },

    /** Undo everything (server state stays, the page re-renders from it). */
    reset() { location.reload() },
  }

  window.VISUAL = VISUAL
  return Object.keys(VISUAL)
}
