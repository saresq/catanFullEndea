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
  // `editor()` runs on /map-editor, which has no game; every other hook needs one.
  const editor = window.map_editor
  if (!game && !editor) { return 'no window.game or window.map_editor - open /game/<id> or /map-editor first' }

  const $$ = sel => [...document.querySelectorAll(sel)]
  const free = sel => $$(sel).filter($_ => !$_.classList.contains('taken')).map($_ => $_.dataset.id)
  /** Someone other than the viewer - an offer from yourself renders as an ongoing trade instead. */
  const other = game?.opponents?.[0]?.id || 2
  /** The viewer's own player object (absent for spectators). */
  const self = () => [...Array(12).keys()].map(i => game.getPlayer(i + 1)).find(p => p && !game.opponents.includes(p))

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
     * Call it several times with different ids to stack offers: `requestsShare` is what the
     * 35%-of-the-viewport cap on phones is read from.
     */
    trade(pid = other, id = 'visual-1') {
      // `status` and `rejected` are what the socket sends; without them the row renders hidden
      // and its Accept button is never gated on what the viewer can pay.
      game.requestTradeSoc(pid, { id, giving: { W: 2, S: 1 }, asking: { B: 1 }, status: 'open', rejected: [] })
      const $req = document.querySelector(`.request[data-id="${id}"]`)
      $req?.classList.remove('hide')
      const $list = document.querySelector('#game .trade-requests')
      return {
        viewport: `${innerWidth}x${innerHeight}`,
        // The player colour sits on the row itself; the older markup carried it on `.text`.
        colour: $req ? getComputedStyle($req.querySelector('.text') || $req).borderLeftColor : 'no request',
        requests: $$('#game .trade-requests .request:not(.hide)').length,
        requestsShare: $list ? +($list.getBoundingClientRect().height / innerHeight).toFixed(3) : null,
        requestsScroll: $list ? $list.scrollHeight > $list.clientHeight : null,
      }
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
      out['trade.request'] = of(document.querySelector('.request .text') || document.querySelector('.request'), 'border-left-color')
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

    /**
     * Scoreboard geometry, for the gates in the scoreboard change: one entry per row (height,
     * name width, tile count, horizontal overflow), where the panel ends against the dock, how
     * much of the viewport height it takes, and the smallest stat count font. Run after
     * `colours()` for 11 rows.
     */
    scoreboard() {
      const $panel = document.querySelector('.all-players')
      const px = n => +n.toFixed(1)
      const box = $panel.getBoundingClientRect()
      // The dock is only in the way where it sits under the panel's column. `.hand` is a
      // full-width transparent strip above the bar, so it does not count.
      const dock = $$('#game .current-player > :not(.hand)').map($_ => $_.getBoundingClientRect())
        .filter(r => r.height && r.right > box.left && r.left < box.right).map(r => r.top)
      const rows = $$('.all-players .player').map($p => ({
        top: px($p.getBoundingClientRect().top),
        height: px($p.getBoundingClientRect().height),
        nameWidth: px($p.querySelector('.name').getBoundingClientRect().width),
        vp: $p.querySelector('.victory-points span').textContent,
        tiles: [...$p.querySelectorAll('.cards-container > *')].filter($_ => $_.offsetWidth).length,
        overflowX: $p.scrollWidth > $p.clientWidth,
      }))
      const counts = $$('.all-players .cards-container > *').filter($_ => $_.offsetWidth)
        .map($_ => parseFloat(getComputedStyle($_, '::after').fontSize))
      return {
        viewport: `${innerWidth}x${innerHeight}`,
        compact: $panel.classList.contains('compact'),
        rows: rows.length,
        lines: new Set(rows.map(r => r.top)).size,
        panelBottom: px(box.bottom),
        dockTop: dock.length ? px(Math.min(...dock)) : null,
        panelShare: +(box.height / innerHeight).toFixed(3),
        minCountFont: counts.length ? Math.min(...counts) : null,
        maxRowHeight: Math.max(...rows.map(r => r.height)),
        minTiles: Math.min(...rows.map(r => r.tiles)),
        anyOverflowX: rows.some(r => r.overflowX),
        rowList: rows,
      }
    },

    /**
     * Put `cards` in the viewer's hand through the same update the server sends. Default: all
     * five resources and several development cards. `hand({})` empties it. Client-side only.
     */
    hand(cards = { S: 3, L: 2, B: 4, O: 1, W: 5, dK: 2, dR: 1, dM: 1, dY: 1, dVp: 2 }) {
      const me = self()
      if (!me) return 'no player - spectating?'
      game.updatePlayerSoc({ ...me, closed_cards: { ...cards } }, 'closed_cards_visual', cards)
      return me.closed_cards
    },

    /**
     * Dock geometry, for the gates in the action-bar-dock change: dock + status height and its
     * share of the viewport, hand cards that rise above the dock top (onto the board), hit size
     * and label of every action, and the dock height with an empty vs a full hand.
     */
    dock() {
      const $dock = document.querySelector('#game > .current-player')
      const px = n => +n.toFixed(1)
      const measure = () => $dock.getBoundingClientRect().height
      const top = $dock.getBoundingClientRect().top
      const shown = $_ => $_.offsetWidth && getComputedStyle($_).visibility !== 'hidden'
      const cardsAbove = $$('.hand .card').filter(shown)
        .filter($c => $c.getBoundingClientRect().top < top - 0.5).length
      // A slim button may grow its tap area with an absolutely positioned `::after`; count that.
      const hit = $b => {
        const r = $b.getBoundingClientRect()
        const a = getComputedStyle($b, '::after')
        if (a.content === 'none' || a.position !== 'absolute') return { w: r.width, h: r.height }
        const out = side => Math.max(0, -(parseFloat(a[side]) || 0))
        return { w: r.width + out('left') + out('right'), h: r.height + out('top') + out('bottom') }
      }
      const actions = $$('.current-player .actions button').filter(shown).map($b => {
        const r = $b.getBoundingClientRect()
        const t = hit($b)
        const $label = $b.querySelector('.label')
        return {
          action: $b.className.split(' ')[0],
          w: px(t.w), h: px(t.h), top: Math.round(r.top),
          label: $label && shown($label) ? $label.textContent.trim() : null,
          name: $b.getAttribute('aria-label'), title: $b.title,
        }
      })
      const height = measure()
      const me = self()
      let emptyHeight = null, fullHeight = null
      if (me) {
        const saved = { ...me.closed_cards }
        VISUAL.hand({}); emptyHeight = px(measure())
        VISUAL.hand(); fullHeight = px(measure())
        VISUAL.hand(saved)
      }
      return {
        viewport: `${innerWidth}x${innerHeight}`,
        height: px(height),
        share: +(height / innerHeight).toFixed(3),
        cardsAbove,
        minHit: actions.length ? Math.min(...actions.map(a => Math.min(a.w, a.h))) : null,
        labels: actions.filter(a => a.label).length,
        emptyHeight, fullHeight,
        actionRows: new Set(actions.map(a => a.top)).size,
        actions,
      }
    },

    /**
     * Status history, for the gates in the status-history-sheet change. Fills the history through
     * the same `*Soc` methods the socket calls (a Setup build, two turns with rolls, a trade and
     * one long status), opens the sheet and reports where it lands: its rect and share of the
     * viewport, whether it overlaps the scoreboard or covers the dock, whether the status text
     * stays on one line, the History control's hit size and the turn headers in DOM order with
     * the entries under each. Runs on the old markup too, so a "before" capture is comparable.
     * Leaves the sheet open for the screenshot that follows; reload to undo the history.
     */
    history() {
      const $sheet = document.querySelector('.status-history-zone')
      if (!$sheet) return 'no .status-history-zone'
      const px = n => +n.toFixed(1)
      const rect = $_ => { const r = $_.getBoundingClientRect(); return { x: px(r.x), y: px(r.y), w: px(r.width), h: px(r.height) } }
      const overlaps = (a, b) => !!a && !!b && a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom
      const state = game.state, pid = game.active_pid
      const me = self(), them = game.opponents?.[0]
      // Setup, then two turns: each starts with the roll state (the separator) and rolls the dice.
      const corners = free('.corner'), edges = free('.edge')
      game.updateBuildSoc(me?.id || 1, 'S', corners[3])
      ;[them, me].filter(Boolean).forEach((p, i) => {
        game.updateStateChangeSoc('player_roll', p.id)
        game.updateDiceValueSoc([4, i + 3], p.id)
        game.updateBuildSoc(p.id, 'R', edges[i * 4 + 2])
      })
      // One long status: a full trade reads as the longest line the bar ever shows.
      game.updateTradedInfoSoc(them?.id || 2, { S: 3, L: 2, B: 1 }, { O: 2, W: 3 }, me?.id)
      game.updateStateChangeSoc(state, pid)

      $sheet.classList.add('show')
      const $text = document.querySelector('#game .current-player .status-text')
        || document.querySelector('#game .current-player .status-bar')
      const $toggle = document.querySelector('#game .history-toggle, #game .status-bar-history')
      const $list = $sheet.querySelector('.container')
      const box = $sheet.getBoundingClientRect()
      const $dock = document.querySelector('#game > .current-player')
      // Headers and entries in DOM order: a header has to come out above the entries it labels.
      const order = [...$list.children].map($_ => $_.classList.contains('turn-separator')
        ? { header: $_.textContent.trim() || '(unlabelled)' } : { entry: $_.textContent.trim().slice(0, 40) })
      return {
        viewport: `${innerWidth}x${innerHeight}`,
        sheet: rect($sheet),
        heightShare: +(box.height / innerHeight).toFixed(3),
        widthShare: +(box.width / innerWidth).toFixed(3),
        overlapsScoreboard: overlaps(box, document.querySelector('.all-players')?.getBoundingClientRect()),
        overlapsDock: overlaps(box, $dock?.getBoundingClientRect()),
        statusOneLine: !!$text && $text.getClientRects().length === 1 && $text.scrollWidth <= $text.clientWidth + 1,
        statusTruncated: !!$text && $text.scrollWidth > $text.clientWidth + 1,
        toggle: $toggle ? { label: $toggle.textContent.trim(), ...rect($toggle), expanded: $toggle.getAttribute('aria-expanded') } : null,
        titleTop: px($sheet.querySelector('.title').getBoundingClientRect().top),
        listScrolls: $list.scrollHeight > $list.clientHeight,
        headers: order.filter(o => o.header).map(o => o.header),
        order,
      }
    },

    /**
     * The trade drawer, for the gates in the trade-drawer change: where it lands, whether it
     * covers a scoreboard row, whether it scrolls the page sideways, the smallest stepper hit box
     * and the bank rates on show. Opens the way the dock does (`onTradeClick` ->
     * `renderTradeSelection()`), with the Trade button's turn gate lifted so it opens off-turn
     * too, then switches mode. Leaves the drawer open for the screenshot that follows.
     */
    tradeDrawer(mode = 'players') {
      const $btn = document.querySelector('#game .current-player .actions .trade')
      if (!$btn) { return 'no Trade button' }
      $btn.classList.remove('disabled')
      $btn.click()
      const $drawer = document.querySelector('#game .trade-card-selection')
      if (!$drawer || $drawer.classList.contains('hide')) { return 'drawer did not open' }
      $drawer.querySelector(`.head .mode[data-mode="${mode}"]`)?.click()
      const px = n => +n.toFixed(1)
      const rect = $_ => { const r = $_.getBoundingClientRect(); return { x: px(r.x), y: px(r.y), w: px(r.width), h: px(r.height) } }
      const overlaps = (a, b) => !!a && !!b && a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom
      const box = $drawer.getBoundingClientRect()
      // Every control that stakes or unstakes a card: the cards themselves and the deal's chips.
      const taps = $$('#game .trade-card-selection :is(.pick, .chip)').filter($_ => $_.offsetWidth)
      const $submit = $drawer.querySelector('.foot .submit')
      return {
        viewport: `${innerWidth}x${innerHeight}`,
        mode: $drawer.dataset.mode,
        drawer: rect($drawer),
        share: +(box.height / innerHeight).toFixed(3),
        inView: box.top >= -0.5 && box.left >= -0.5 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
        // The whole point of the right edge stopping at the scoreboard column.
        overlapsRows: $$('.all-players .player').filter($p => overlaps(box, $p.getBoundingClientRect())).length,
        hScroll: document.documentElement.scrollWidth > innerWidth,
        drawerScrollsX: $drawer.scrollWidth > $drawer.clientWidth + 1,
        drawerScrollsY: $drawer.scrollHeight > $drawer.clientHeight + 1,
        minHit: taps.length ? px(Math.min(...taps.map($_ => {
          const r = $_.getBoundingClientRect(); return Math.min(r.width, r.height)
        }))) : null,
        taps: taps.length,
        rates: $$('#game .trade-card-selection .palette.give .rate').map($_ => $_.textContent.trim()),
        staked: $$('#game .trade-card-selection .chip').map($_ => $_.dataset.row + ':' + $_.dataset.type + ':' + parseInt($_.textContent, 10)),
        guide: $drawer.querySelector('.foot .guide')?.textContent.trim() || null,
        submit: $submit && { label: $submit.textContent.trim(), disabled: $submit.disabled },
        blurred: !!document.querySelector('.board.blur, .all-players.blur'),
      }
    },

    /**
     * The discard drawer, reached the way the socket reaches it: 14 resources in the hand (so 7 to
     * discard), then the drop state through `updateStateChangeSoc()`. `resource_count` is what the
     * server sends next to the hand, so it is set by hand here. Reports the drawer (see `drawer()`)
     * and whether the big alert is up over it; the drawer has no cards of its own, so it also
     * reports the glowing (`active`) hand stacks on screen. Leaves the drawer open.
     */
    discard(cards = { S: 3, L: 3, B: 3, O: 3, W: 2 }) {
      const me = self()
      if (!me) return 'no player - spectating?'
      VISUAL.hand(cards)
      me.resource_count = Object.values(cards).reduce((m, v) => m + v, 0)
      game.updateStateChangeSoc('drop_resource_for_robber', other)
      const report = VISUAL.drawer('.robber-drop-zone')
      if (typeof report === 'string') return report
      const glowing = $$('.hand .card-group.active').filter($g => {
        const b = $g.getBoundingClientRect()
        return b.width > 0 && b.top >= -0.5 && b.bottom <= innerHeight + 0.5 && b.left >= -0.5 && b.right <= innerWidth + 0.5
      })
      return { ...report, handGlowingInView: glowing.map($g => $g.dataset.type) }
    },

    /**
     * Year of Plenty (`'dY'`) or Monopoly (`'dM'`) picker, through `game.onDevCardActivate()`.
     * `canPlayDevCard` wants the card in hand, `can_play_dc`, the viewer's own action phase and no
     * card already in play, so the hook sets exactly that: the hand, then the action state for the
     * viewer through `updateStateChangeSoc()` (which also clears any card in play). Leaves it open.
     */
    picker(type = 'dY') {
      const me = self()
      if (!me) return 'no player - spectating?'
      VISUAL.hand()
      me.can_play_dc = true
      me.turn_bought_dc = {}
      game.updateStateChangeSoc('player_actions', me.id)
      game.onDevCardActivate(type)
      return VISUAL.drawer('.resource-selection-zone')
    },

    /** Geometry and state of one resource drawer, for `discard()` and `picker()`. */
    drawer(sel) {
      const $d = document.querySelector(`#game ${sel}`)
      if (!$d || !$d.offsetWidth) return `${sel} not shown`
      const px = n => +n.toFixed(1)
      const r = $d.getBoundingClientRect()
      const $dock = document.querySelector('#game > .current-player')
      const dock = $dock.getBoundingClientRect()
      const taps = [...$d.querySelectorAll('button, .btn, .card, .ctrl, .drop-emoji')].filter($_ => $_.offsetWidth)
      const $submit = $d.querySelector('.submit, .drop-give-button')
      const inView = $_ => { const b = $_.getBoundingClientRect(); return b.width > 0 && b.top >= -0.5 && b.left >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5 }
      return {
        viewport: `${innerWidth}x${innerHeight}`,
        drawer: { x: px(r.x), y: px(r.y), w: px(r.width), h: px(r.height) },
        share: +(r.height / innerHeight).toFixed(3),
        inView: inView($d),
        alertShown: !!document.querySelector('#game > .alert.show'),
        hScroll: document.documentElement.scrollWidth > innerWidth,
        drawerScrollsX: $d.scrollWidth > $d.clientWidth + 1,
        drawerScrollsY: $d.scrollHeight > $d.clientHeight + 1,
        overlapsDock: r.bottom > dock.top + 0.5,
        dockInView: dock.top < innerHeight && dock.height > 0,
        timerInView: !!$dock.querySelector('.timer') && inView($dock.querySelector('.timer')),
        minHit: taps.length ? px(Math.min(...taps.map($_ => { const b = $_.getBoundingClientRect(); return Math.min(b.width, b.height) }))) : null,
        resourcesInView: [...$d.querySelectorAll('.pick')].filter(inView).length,
        title: $d.querySelector('.title')?.textContent.trim() || null,
        counter: $d.querySelector('.counter')?.textContent.trim() || null,
        counterInView: !!$d.querySelector('.counter') && inView($d.querySelector('.counter')),
        guide: $d.querySelector('.guide')?.textContent.trim() || null,
        submit: $submit && { label: $submit.textContent.trim(), disabled: $submit.disabled || !!$submit.matches('.btn--gated:not(.active)'), inView: inView($submit) },
      }
    },

    /**
     * Options menu, for the gates in the options-menu change: one entry per item (label, state
     * text, key hint, tap size), how many items carry no label, and whether recenter is reachable
     * with the menu closed. Works on any page that renders the zone (game, login, waiting room,
     * map editor). Leaves the menu open for the screenshot that follows.
     */
    menu() {
      const $zone = document.querySelector('#game .accessibility-zone')
      if (!$zone) return 'no .accessibility-zone'
      const px = n => +n.toFixed(1)
      const shown = $_ => $_.offsetWidth && getComputedStyle($_).visibility !== 'hidden'
      const $gear = $zone.querySelector('.settings-gear')
      const $recenter = $zone.querySelector('.recenter')
      // Read before opening: recenter has to be reachable without going through the menu.
      const recenterClosed = !!($recenter && shown($recenter) && !$recenter.closest('.options-menu'))
      $gear.click()
      const $menu = $zone.querySelector('.options-menu, .icons-container')
      const text = ($i, sel) => $i.querySelector(sel)?.textContent.trim() || null
      const items = [...$menu.querySelectorAll('button')].filter(shown).map($i => {
        const r = $i.getBoundingClientRect()
        return {
          item: $i.className.replace(/\b(icon|item)\b/g, '').trim(),
          label: text($i, '.label'),
          state: text($i, '.state'),
          key: text($i, '.key'),
          w: px(r.width), h: px(r.height), top: Math.round(r.top),
          pressed: $i.getAttribute('aria-pressed'),
        }
      })
      return {
        viewport: `${innerWidth}x${innerHeight}`,
        expanded: $gear.getAttribute('aria-expanded'),
        recenterClosed,
        separator: !!$menu.querySelector('.sep'),
        count: items.length,
        // One item per line is the whole point: the column has to look the same at every width.
        lines: new Set(items.map(i => i.top)).size,
        unlabelled: items.filter(i => !i.label).length,
        minHit: items.length ? Math.min(...items.map(i => Math.min(i.w, i.h))) : null,
        items,
      }
    },

    /**
     * The map editor, on /map-editor - the one page with no game behind it. Reports the tool
     * dock, the rail, the rim phantoms and the coastline, then opens the port popover on a real
     * port tile and leaves it on screen for the screenshot that follows.
     *
     * The numbers to gate on: `chrome.overlap` and `chrome.hScroll` false at every viewport,
     * `taps.min` at least 44, `coast.doubleDrawn` zero, `rim.sides` all four, and `coast.onLand`
     * above zero on a map whose land reaches the edge of the grid.
     */
    editor(mapkey) {
      if (!editor) { return 'no window.map_editor - open /map-editor first' }
      if (mapkey) {
        document.querySelector('#mapkey').value = mapkey
        editor.renderMapkey()
      }
      const px = n => +n.toFixed(1)
      const box = $_ => { const r = $_.getBoundingClientRect(); return { x: px(r.left), y: px(r.top), w: px(r.width), h: px(r.height) } }
      const $dock = document.querySelector('#editor-dock')
      const $rail = document.querySelector('#editor-rail')
      const dock = box($dock), rail = box($rail)

      const controls = [...document.querySelectorAll('#editor-dock button, #editor-rail button, #editor-float button')]
        .filter($_ => !$_.hidden && $_.offsetParent)
      const taps = controls.map($_ => { const r = $_.getBoundingClientRect(); return Math.min(r.width, r.height) })

      const vp = editor.board_ui.getViewport()
      const $rim = [...document.querySelectorAll('.rim-add')]

      // One element per coast edge, and never two for the same edge.
      const beaches = [...document.querySelectorAll('#game .board .beach')]
      const owners = beaches.map($_ => {
        const $tile = $_.closest('.tile')
        return { id: +$tile.dataset.id, sea: $tile.classList.contains('S'), dir: $_.className.match(/beach-([a-z_]+)/)[1] }
      })
      const opposite = { top_left: 'bottom_right', top_right: 'bottom_left', right: 'left',
        bottom_right: 'top_left', bottom_left: 'top_right', left: 'right' }
      const key = new Set(owners.map(o => `${o.id}:${o.dir}`))
      const doubleDrawn = owners.filter(o => {
        const neighbour = editor.board.findTile(o.id)?.adjacent_tiles[o.dir]
        return neighbour && key.has(`${neighbour.id}:${opposite[o.dir]}`)
      }).length

      // Park the port popover open, on a tile that already carries a port.
      const port_tile = editor.board.tile_rows.flat().find(t => t.type === 'S' && t.trade_edge)
      if (port_tile) {
        document.querySelector('.brush[data-brush="port"]').click()
        editor.openPort(port_tile.id)
      }
      const $popover = document.querySelector('.editor-popover.open')

      return {
        viewport: `${innerWidth}x${innerHeight}`,
        chrome: {
          dock, rail,
          dockShare: px(dock.h / innerHeight * 100) + '%',
          hScroll: document.documentElement.scrollWidth > innerWidth,
          overlap: dock.y < rail.y + rail.h && dock.y + dock.h > rail.y
            && dock.x < rail.x + rail.w && dock.x + dock.w > rail.x,
          boardShare: px(vp.width * vp.height / (innerWidth * innerHeight) * 100) + '%',
        },
        taps: { count: taps.length, min: px(Math.min(...taps)) },
        dockRows: {
          brushes: [...document.querySelectorAll('.brush')].map($_ => $_.dataset.brush),
          numbers: [...document.querySelectorAll('.num-chip')].map($_ => $_.dataset.number || 'none'),
          active: document.querySelector('.brush.active')?.dataset.brush || null,
          undo: document.querySelector('.editor-undo').disabled ? 'empty' : 'available',
          issues: document.querySelector('.dock-issues').hidden ? null : document.querySelector('.dock-issues').textContent.trim(),
        },
        rim: { count: $rim.length, sides: $rim.map($_ => $_.dataset.side), size: $rim[0] && px($rim[0].getBoundingClientRect().width) },
        // Undo and redo float over the board; they have to clear both pieces of bottom chrome.
        float: (() => {
          const f = document.querySelector('#editor-float').getBoundingClientRect()
          return {
            box: box(document.querySelector('#editor-float')),
            clearOfDock: f.bottom <= dock.y + 0.5,
            clearOfRail: f.right <= rail.x + 0.5 || f.bottom <= rail.y + 0.5,
            inView: f.top >= 0 && f.left >= 0 && f.right <= innerWidth && f.bottom <= innerHeight,
          }
        })(),
        toggles: [...document.querySelectorAll('.opt-chip')].map($_ => ({
          option: $_.dataset.shuffle || $_.dataset.keep,
          on: $_.getAttribute('aria-pressed'),
          mark: !!$_.querySelector('.chip-mark'),
        })),
        coast: {
          total: beaches.length,
          onLand: owners.filter(o => !o.sea).length,
          onSea: owners.filter(o => o.sea).length,
          doubleDrawn,
          variants: [...new Set(beaches.map($_ => $_.className.match(/beach-(\d)/)[1]))].sort(),
        },
        port: $popover && {
          id: $popover.id,
          box: box($popover),
          coversSubject: (() => {
            const $tile = document.querySelector(`.tile[data-id="${port_tile.id}"]`)
            const t = $tile.getBoundingClientRect(), p = $popover.getBoundingClientRect()
            return t.right > p.left && t.left < p.right && t.bottom > p.top && t.top < p.bottom
          })(),
          edges: [...document.querySelectorAll('.port-edge')].map($_ => {
            const r = $_.getBoundingClientRect()
            return { edge: $_.dataset.edge, w: px(r.width), h: px(r.height), active: $_.classList.contains('active') }
          }),
          type: document.querySelector('.port-type.active')?.dataset.type || null,
        },
        flagged: [...document.querySelectorAll('.tile.flagged')].map($_ => +$_.dataset.id),
        info: (() => {
          // Map info reads the map back: the terrain bars and the dice strip are the panel.
          editor.togglePopover('info')
          const rows = [...document.querySelectorAll('.res-row')].map($_ => ({
            name: $_.querySelector('.res-name').textContent.trim().replace(/\s+/g, ' '),
            count: +$_.querySelector('.res-count').textContent,
            fill: $_.style.getPropertyValue('--fill').trim(),
          }))
          // A bar per number, standing on the board's own token as its label.
          const dice = [...document.querySelectorAll('.dice-col')].map($_ => ({
            num: $_.querySelector('.dice-token').getAttribute('num'),
            red: $_.querySelector('.dice-token').classList.contains('red'),
            count: +($_.querySelector('.dice-count').textContent || 0),
            fill: $_.querySelector('.dice-bar').style.getPropertyValue('--fill').trim(),
            label: $_.getAttribute('aria-label'),
          }))
          return {
            facts: [...document.querySelectorAll('.info-facts > *')].map($_ => $_.textContent.trim()),
            terrain: rows, dice,
            problems: [...document.querySelectorAll('.info-problems li')].map($_ => $_.textContent.trim()),
          }
        })(),
        gameSetup: (() => {
          // The one surface that takes the screen; everything else edits in place.
          editor.openGameSetup()
          const $modal = document.querySelector('#modal-game')
          const shown = !document.querySelector('.editor-scrim').hidden
          const out = { shown, box: box($modal), seats: document.querySelector('#seat-note').textContent.trim() }
          editor.closeModal()
          return out
        })(),
      }
    },

    /** Undo everything (server state stays, the page re-renders from it). */
    reset() { location.reload() },
  }

  window.VISUAL = VISUAL
  return Object.keys(VISUAL)
}
