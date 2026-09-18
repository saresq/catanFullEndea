import BoardUI from "./board_ui.js"
const $ = document.querySelector.bind(document)
// const oKeys = Object.keys

export default class MapBuilderBoardUI extends BoardUI {
  viewStorageKey = 'map-editor-board-view'

  /** @override the shuffler panel covers the right side of the screen */
  getViewport() {
    const panel = $('#shuffler')?.offsetWidth || 0
    return { x: 0, y: 0, width: Math.max(100, window.innerWidth - panel), height: window.innerHeight }
  }

  /** @override adding tile-replace icon */
  tileExtraHtml(tile) { return '<div class="tile-replace"></div>' }
}
