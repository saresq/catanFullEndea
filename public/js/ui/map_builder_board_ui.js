import BoardUI from "./board_ui.js"
import * as CONST from "../const.js"
const $ = document.querySelector.bind(document)
// const oKeys = Object.keys

export default class MapBuilderBoardUI extends BoardUI {
  $tile_selector = $('#tile-selector')
  viewStorageKey = 'map-editor-board-view'

  constructor(board, onClick, size) {
    super(board, onClick, size)
  }

  /** @override the shuffler panel covers the right side of the screen */
  getViewport() {
    const panel = $('#shuffler')?.offsetWidth || 0
    return { x: 0, y: 0, width: Math.max(100, window.innerWidth - panel), height: window.innerHeight }
  }

  render() {
    super.render()
    this.renderTileSelector()
  }

  renderTileSelector() {
    // this.$tile_selector.innerHTML = `
    // `
  }

  /** @override adding tile-replace icon */
  renderRow(row) {
    /** @todo Might wanna consider moving to react */
    return row.map((tile, j) =>
      `<div
        class="tile ${tile.type} ${tile.robbed ? 'robbed' : ''}"
        data-id="${tile.id}"
        ${(tile.type === 'S' && tile.trade_edge)
        ? `data-trade="${tile.trade_type}" data-trade-dir="${tile.trade_edge}"`
        : ''
      }
      >
        <div class="background"></div>
        <div class="corners">${super.renderCorners(tile)}</div>
        <div class="edges">${super.renderEdges(tile)}</div>
        ${tile.type === 'S' ? `<div class="beaches">${super.renderBeaches(tile)}</div>` : ''}
        ${tile.num
        ? `<div
              class="number ${tile.num > 5 && tile.num < 9 ? 'red' : ''}"
              num="${tile.num}"
              dots="${'.'.repeat(6 - Math.abs(7 - tile.num))}">
            </div>`
        : ''
        }
        <div class="tile-replace"></div>
      </div>`
    ).join('')
  }
}
