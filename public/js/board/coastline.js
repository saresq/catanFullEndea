/**
 * Who owns a coast edge, and which piece of art it gets.
 *
 * DOM-free so it can be tested under `node --test`: `board_ui.js` binds `document.querySelector`
 * at module scope and cannot be imported outside a browser.
 */

const BEACH_VARIANTS = 3

/**
 * All six edges, in a fixed order. `tile.adjacent_tiles` is built with only `left`, `top_left`
 * and `top_right` (`tile.js:24`); the other three appear as back-links from neighbours, so a
 * border tile is missing those keys entirely and iterating the object would skip the very edges
 * a land tile has to coast.
 */
export const EDGES = ['top_left', 'top_right', 'right', 'bottom_right', 'bottom_left', 'left']

/**
 * Exactly one tile owns each coast edge:
 * - a sea tile owns every edge it shares with land;
 * - a land tile owns only an edge with no neighbour at all.
 *
 * The two conditions are mutually exclusive by construction, so no edge is ever drawn twice.
 * With the grid expansion in `map_grid.js` in place, every land tile is ringed by sea, so the
 * land-side branch is a safety net for hand-pasted mapkeys rather than the common path.
 */
export function ownsCoast(tile, dir) {
  const neighbor = tile.adjacent_tiles[dir]
  return tile.type === 'S' ? !!(neighbor && neighbor.type !== 'S') : !neighbor
}

/**
 * Which piece of coast art an edge gets. Derived from the tile id and the direction rather than
 * rolled, because every committed edit rebuilds the whole board: a random pick reshuffled the
 * entire coastline on every click.
 */
export function beachVariant(id, dir) {
  let h = (id + 1) * 2654435761 % 4294967296
  for (let i = 0; i < dir.length; i++) { h = (h * 31 + dir.charCodeAt(i)) % 4294967296 }
  return (h % BEACH_VARIANTS) + 1
}
