import { shuffle as arrayShuffle } from "../utils.js"
import Board from "./board.js"

const edge_shortcut = {
  top_left: 'tl', top_right: 'tr', left: 'l',
  right: 'r', bottom_left: 'bl', bottom_right: 'br',
}

export default class BoardShuffler {
  #board;
  #tiles = []
  #numbers = []
  #port_tiles = []

  constructor(mapkey) {
    this.#board = new Board(mapkey, null, true)
    this.#board.tile_rows.forEach(row => {
      row.forEach(tile => {
        if (tile.type === 'S') {
          tile.trade_edge && this.#port_tiles.push(tile)
          return
        }
        this.#tiles.push(tile.type)
        tile.type !== 'D' && this.#numbers.push(tile.num)
      })
    })
  }

  /** @param {false|'none'|'all'|'number'|'port'|'tile'|'(combo of number-port-tile)'} type  */
  shuffle(type) {
    if (!type || type === 'none') { return this.toMapKey() }
    type = type + ''
    const shuff_nums = type === 'all' || type.includes('number')
    const shuff_ports = type === 'all' || type.includes('port')
    const shuff_tiles = type === 'all' || type.includes('tile')
    let tile_index = 0, number_index = 0
    const new_tiles = shuff_tiles ? arrayShuffle(this.#tiles) : this.#tiles
    const new_numbers = shuff_nums ? arrayShuffle(this.#numbers) : this.#numbers
    // Track which numbers are adjacent to each tile
    const adjacent_numbers = {}

    this.#board.tile_rows.forEach(row => {
      row.forEach(tile => {
        if (tile.type === 'S') return
        tile.type = new_tiles[tile_index++]
        if (tile.type === 'D') return
        
        tile.num = new_numbers[number_index++]
        if (!shuff_nums) return
        
        /**
         * @description Preventing adjacent same numbers and treating 6 and 8 as equivalent
         * This algorithm ensures that:
         * 1. No number is adjacent to the same number value
         * 2. Numbers 6 and 8 (red numbers) are treated as equivalent and never adjacent
         * 
         * For each tile, we check if its number conflicts with adjacent tiles:
         * - A conflict occurs if the same number is adjacent
         * - A conflict also occurs if a 6 is adjacent to an 8 or vice versa
         * 
         * When conflicts are found, we try these strategies in order:
         * a. Swap with a previously processed tile that would create no new conflicts
         * b. Swap with a number from the remaining pool that isn't adjacent
         * c. If no valid swap is found, leave it as is (rare edge case)
         */
        
        // Get all adjacent numbers for this tile
        const adjacent_nums = new Set()
        Object.values(tile.adjacent_tiles)
          .filter(Boolean)
          .filter(t => t.type !== 'S' && t.type !== 'D' && t.num)
          .forEach(t => {
            adjacent_nums.add(+t.num)
            // Treat 6 and 8 as equivalent (red numbers)
            if (+t.num === 6) adjacent_nums.add(8)
            if (+t.num === 8) adjacent_nums.add(6)
          })
        
        // If the current number is already adjacent or (6 adjacent to 8 or vice versa), try to swap
        if (adjacent_nums.has(+tile.num)) {
          // First, try to find a tile that doesn't have this number adjacent to it
          const clear_tile_indices = []
          
          // Collect all previously processed tiles that aren't desert or sea
          for (let i = 0; i < number_index - 1; i++) {
            const processed_tile = this.#board.findTile(i)
            if (processed_tile && processed_tile.type !== 'S' && processed_tile.type !== 'D') {
              clear_tile_indices.push(i)
            }
          }
          
          // Find a compatible tile to swap with
          let swapped = false
          for (const clear_tile_i of clear_tile_indices) {
            const clear_tile = this.#board.findTile(clear_tile_i)
            
            // Get adjacent numbers for the potential swap tile
            const clear_adjacent_nums = new Set()
            Object.values(clear_tile.adjacent_tiles)
              .filter(Boolean)
              .filter(t => t.type !== 'S' && t.type !== 'D' && t.num)
              .forEach(t => {
                clear_adjacent_nums.add(+t.num)
                // Treat 6 and 8 as equivalent (red numbers)
                if (+t.num === 6) clear_adjacent_nums.add(8)
                if (+t.num === 8) clear_adjacent_nums.add(6)
              })
            
            // Check if swapping would create no conflicts
            // For 6 and 8, we need to check both numbers
            const tileNumConflict = clear_adjacent_nums.has(+tile.num) || 
              ((+tile.num === 6 || +tile.num === 8) && (clear_adjacent_nums.has(6) || clear_adjacent_nums.has(8)))
            
            const clearTileNumConflict = adjacent_nums.has(+clear_tile.num) || 
              ((+clear_tile.num === 6 || +clear_tile.num === 8) && (adjacent_nums.has(6) || adjacent_nums.has(8)))
            
            if (!tileNumConflict && !clearTileNumConflict) {
              // Swap the numbers
              const tmp = clear_tile.num
              clear_tile.num = tile.num
              tile.num = tmp
              swapped = true
              break
            }
          }
          
          // If no compatible tile found, try to swap with a number from the remaining pool
          if (!swapped) {
            for (let i = number_index; i < new_numbers.length; i++) {
              // Check if the number from the pool would conflict with adjacent tiles
              // For 6 and 8, we need to check both numbers
              const poolNumConflict = adjacent_nums.has(+new_numbers[i]) || 
                ((+new_numbers[i] === 6 || +new_numbers[i] === 8) && (adjacent_nums.has(6) || adjacent_nums.has(8)))
              
              if (!poolNumConflict) {
                const tmp = new_numbers[i]
                new_numbers[i] = tile.num
                tile.num = tmp
                swapped = true
                break
              }
            }
          }
          
          // If still not swapped, we'll have to leave it (RNGesus 🙏)
        }
      })
    })

    if (shuff_ports) {
      // Switch ports
      arrayShuffle(this.#port_tiles.map(_ => _.id)).forEach((id, i) => {
        const old_tile = this.#port_tiles[i]
        const new_tile = this.#board.findTile(id)
        const { trade_type, trade_ratio } = old_tile
        old_tile.trade_type = new_tile.trade_type
        old_tile.trade_ratio = new_tile.trade_ratio
        new_tile.trade_type = trade_type
        new_tile.trade_ratio = trade_ratio
      })
    }

    return this.toMapKey()
  }

  toMapKey() {
    return this.#board.tile_rows.map((row, i) => {
      const diff = i > 0
        ? row.diff > 0 ? '+' : '-'
        : ''
      return diff + row.map(tile => {
        if (tile.type === 'D') return 'D'
        if (tile.type === 'S') {
          return 'S' + (tile.trade_edge ? `(${edge_shortcut[tile.trade_edge]}_${tile.trade_type}${tile.trade_ratio})` : '')
        }
        return tile.type + tile.num
      }).join('.')
    }).join('')
  }
}
