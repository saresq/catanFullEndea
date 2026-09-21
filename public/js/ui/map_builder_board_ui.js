import BoardUI from "./board_ui.js"
const $ = document.querySelector.bind(document)

/** Chrome that eats into the board's space. Measured, never assumed. */
const CHROME = ['#editor-dock', '#editor-rail', '.editor-popover.open']

export default class MapBuilderBoardUI extends BoardUI {
  viewStorageKey = 'map-editor-board-view'

  /**
   * @override The editor's chrome is docked to the edges: a tool dock along the bottom, an icon
   * rail down the right and, on a wide screen, whichever popover the rail has open. Each is
   * measured where it actually is, because the dock changes height with its contents and the rail
   * folds into the dock on a phone.
   */
  getViewport() {
    let right = 0, bottom = 0
    CHROME.forEach(selector => {
      const $el = document.querySelector(selector)
      if (!$el || !$el.offsetWidth || getComputedStyle($el).position !== 'fixed') { return }
      // On a phone a popover is a bottom sheet over the board, not a slice taken out of it.
      if (selector.startsWith('.editor-popover') && window.innerWidth < 768) { return }
      const rect = $el.getBoundingClientRect()
      // Docked along the bottom if it spans most of the width, against the right otherwise.
      if (rect.width > window.innerWidth * 0.6) { bottom = Math.max(bottom, window.innerHeight - rect.top) }
      else { right = Math.max(right, window.innerWidth - rect.left) }
    })
    // Half a grow button of slack on every side: the rim affordances straddle the board's edge,
    // and a fit with no margin would put them half off the screen.
    const rim = 28
    return {
      x: rim, y: rim,
      width: Math.max(120, window.innerWidth - right - rim * 2),
      height: Math.max(120, window.innerHeight - bottom - rim * 2),
    }
  }

  /** @override a slot the editor fills with whatever is wrong with that tile */
  tileExtraHtml(tile) { return '<div class="tile-flag"></div>' }
}
