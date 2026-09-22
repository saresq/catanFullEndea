/**
 * The mapkey coordinate system, and the grid expansions that have to preserve it.
 *
 * Kept DOM-free on purpose: `map-editor.js` binds `document.querySelector` at module scope,
 * so nothing in it can be imported under `node --test`. The geometry lives here instead.
 *
 * ## The coordinate system
 *
 * A mapkey is a list of rows plus a one-character inter-row offset. `board.js:38-43` turns the
 * sign preceding a row into `diff = ±1`, and `board_ui.js:52,57,63` accumulates those signs into
 * a pixel offset. So the absolute x of the tile at row `i`, index `j`, in tile widths, is
 *
 *     x(i, j) = O_i + j,   O_i = ½ · Σ_{k≤i} d_k,   d_k ∈ {+1, -1}
 *
 * Row 0 has no sign and counts as `+1` (`board.js:42`). Three things follow:
 *
 * 1. A row has no independent origin - `O_i` is the running sum from the top of the file.
 * 2. Row parity is fixed by the row index; adding tokens cannot change it.
 * 3. Consecutive rows' left edges differ by exactly half a tile.
 */

import * as CONST from "../const.js"

/** @typedef {{ sign: string, diff: number, tokens: string[] }} GridRow */

/** What a single token may look like: sea with or without a port, desert, or a numbered resource. */
const TOKEN_RE = new RegExp(`^(?:${CONST.SEA_REGEX}|S|D|[${Object.keys(CONST.TILES).join('')}]\\d*)$`)

/**
 * Split a mapkey into rows carrying their sign. Leading indentation is tolerated because the
 * presets in `const_maps.js` are written as indented template literals.
 * @returns {GridRow[]}
 */
export function parseRows(mapkey) {
  return mapkey.trim().split('\n').map((rowStr, i) => {
    const row = rowStr.trim()
    if (!i) { return { sign: '', diff: 1, tokens: row.split('.') } }
    const sign = row[0]
    return { sign, diff: sign === '-' ? -1 : 1, tokens: row.slice(1).split('.') }
  })
}

/** Inverse of {@link parseRows}. Row 0 carries no sign; every other row carries its own. */
export function serializeRows(rows) {
  return rows.map((row, i) => {
    const rowKey = row.tokens.join('.')
    return i === 0 ? rowKey : (row.sign || '+') + rowKey
  }).join('\n')
}

/**
 * Add a new leftmost column of sea.
 *
 * This is a whole-grid operation, and it has to be: prepending a token to a single row does not
 * give that row a tile on its left, it translates that row's existing content one full tile to
 * the right relative to every other row. Holding the rest of the board still would need `d_r` to
 * flip `+` to `-` *and* `d_{r+1}` to flip `-` to `+`, which is not always representable - if
 * `d_r` is already `-`, or `r` is the last row, no mapkey expresses the result. Unshifting onto
 * every row at once touches no sign, so every row origin is unchanged and the grid simply gains
 * a genuine new leftmost column.
 *
 * @param {string} mapkey
 * @param {number} [times] how many columns to add
 * @returns {string}
 */
export function growLeft(mapkey, times = 1) {
  const rows = parseRows(mapkey)
  growLeftRows(rows, times)
  return serializeRows(rows)
}

/** {@link growLeft} on already-parsed rows, for transforms that grow before they serialize. */
function growLeftRows(rows, times = 1) {
  for (let n = 0; n < times; n++) { rows.forEach(row => row.tokens.unshift('S')) }
  return rows
}

/**
 * Add a new rightmost column of sea. The mirror of {@link growLeft}, and the easy direction:
 * pushing onto a row extends it where the indices already run out.
 */
export function growRight(mapkey, times = 1) {
  const rows = parseRows(mapkey)
  for (let n = 0; n < times; n++) { rows.forEach(row => row.tokens.push('S')) }
  return serializeRows(rows)
}

/**
 * Insert a row of sea above row 0.
 *
 * The demoted row's sign is written out rather than left to the serializer's default. `'+'` keeps
 * it half a tile to the right of the new top row, which translates the whole board by the same
 * half tile and so changes nothing about its shape, and it puts the top-left of the demoted row's
 * first tile inside the new row. The new row spans `n + 1`, because the demoted row's last tile
 * has both a top-left and a top-right up there.
 */
function insertRowAbove(rows) {
  const span = rows[0].tokens.length + 1
  rows[0].sign = '+'
  rows[0].diff = 1
  rows.unshift({ sign: '', diff: 1, tokens: Array(span).fill('S') })
  return rows
}

/**
 * Append a row of sea below the last row. `'-'` is the mirror of {@link insertRowAbove}: it puts
 * the bottom-left of the last row's first tile inside the appended row instead of half a tile off
 * the left edge, so a row of sea never forces the grid to grow sideways.
 */
function insertRowBelow(rows) {
  const span = rows[rows.length - 1].tokens.length + 1
  rows.push({ sign: '-', diff: -1, tokens: Array(span).fill('S') })
  return rows
}

/** Add a new topmost row of sea. */
export function growTop(mapkey, times = 1) {
  const rows = parseRows(mapkey)
  for (let n = 0; n < times; n++) { insertRowAbove(rows) }
  return serializeRows(rows)
}

/** Add a new bottom row of sea. */
export function growBottom(mapkey, times = 1) {
  const rows = parseRows(mapkey)
  for (let n = 0; n < times; n++) { insertRowBelow(rows) }
  return serializeRows(rows)
}

/** Push plain sea onto a row until `idx` is inside it. */
function fillTo(row, idx) {
  while (row.tokens.length <= idx) { row.tokens.push('S') }
}

/**
 * Ensure a land/desert tile at `(r, c)` is ringed by sea, growing the grid where it is not.
 * Pure: same arguments, same string, no DOM.
 *
 * Every index the tile needs is computed first, in the grid as it stands. Whatever falls off the
 * left is paid for with {@link growLeft}, once, for the whole grid; every index is then shifted
 * into the widened grid and the remainder is satisfied by pushing. Nothing is ever unshifted onto
 * a single row - that moves the row, it does not extend it.
 *
 * @param {string} mapkey
 * @param {number} r row index of the edited tile
 * @param {number} c token index of the edited tile within that row
 * @returns {string} the expanded mapkey
 */
export function expandSeaBordersAt(mapkey, r, c) {
  const rows = parseRows(mapkey)
  if (!rows[r] || c < 0 || c >= rows[r].tokens.length) { return mapkey }

  const has_above = !!rows[r - 1]
  const has_below = !!rows[r + 1]
  // `board.js:48` indexes the row above through the *edited* row's sign, and the row below
  // through its own.
  const top_offset = rows[r].diff < 0 ? -1 : 0
  const bottom_offset = has_below && rows[r + 1].diff < 0 ? -1 : 0

  let left = c - 1, right = c + 1
  let top_left = c + top_offset, top_right = top_left + 1
  let bottom_right = c - bottom_offset, bottom_left = bottom_right - 1

  const required = [left, right]
  if (has_above) { required.push(top_left, top_right) }
  if (has_below) { required.push(bottom_left, bottom_right) }

  // One leftward growth per column the tile reaches for and the grid does not have. In practice
  // this is 0 or 1; it is written as a count so repeated growth needs no special case.
  const need = Math.max(0, -Math.min(...required))
  if (need) {
    growLeftRows(rows, need)
    c += need; right += need
    top_right += need; bottom_right += need
  }

  // Everything is now reachable from the left, so the rest is `push` alone.
  fillTo(rows[r], right)
  if (has_above) { fillTo(rows[r - 1], top_right) }
  if (has_below) { fillTo(rows[r + 1], bottom_right) }

  // A tile on the top or bottom row has no row to be ringed by, so one is added.
  let row_index = r
  if (row_index === 0) { insertRowAbove(rows); row_index += 1 }
  if (row_index === rows.length - 1) { insertRowBelow(rows) }

  return serializeRows(rows)
}

/**
 * How the tiles two grids share moved between them: the token at row `r`, index `c` of `before`
 * sits at row `r + rows`, index `c + cols` of `after`. Growth (and its undo) only ever adds or
 * removes whole rows and columns of sea, so every surviving tile moves by the same amount, and
 * it is found by trying every offset the change in size allows and keeping the one under which
 * the most non-sea tokens coincide. Plain sea is never counted: it matches itself everywhere.
 *
 * `anchor` is one `[r, c]` of `before` that matched, so a caller can watch a real tile. `null`
 * when the two grids share no non-sea token, which is nothing to hold on to anyway.
 *
 * @param {string} before
 * @param {string} after
 * @returns {{ rows: number, cols: number, anchor: [number, number] } | null}
 */
export function gridShift(before, after) {
  const a = parseRows(before), b = parseRows(after)
  const width = rows => Math.max(...rows.map(row => row.tokens.length))
  const rows_max = Math.abs(a.length - b.length)
  const cols_max = Math.abs(width(a) - width(b))

  let best = null, best_score = 0, best_distance = Infinity
  for (let rows = -rows_max; rows <= rows_max; rows++) {
    for (let cols = -cols_max; cols <= cols_max; cols++) {
      let score = 0, anchor = null
      a.forEach((row, r) => row.tokens.forEach((token, c) => {
        if (token === 'S' || b[r + rows]?.tokens[c + cols] !== token) { return }
        score++
        anchor ??= [r, c]
      }))
      // Ties go to the smaller move: a tile that can read as itself or as its twin next door
      // is most likely still itself.
      const distance = Math.abs(rows) + Math.abs(cols)
      if (score > best_score || (score === best_score && score && distance < best_distance)) {
        best = { rows: rows || 0, cols: cols || 0, anchor } // `|| 0` turns `-0` into `0`
        best_score = score
        best_distance = distance
      }
    }
  }
  return best
}

/**
 * Why a mapkey cannot be used, or `null` if it can. `Board` is deliberately forgiving - it falls
 * back to sea for anything it does not recognise - so a typo would otherwise render as a board
 * full of water instead of an error.
 *
 * @returns {string | null}
 */
export function validateMapkey(mapkey) {
  if (!mapkey || !mapkey.trim()) { return 'it is empty' }
  const rows = parseRows(mapkey)
  for (let i = 0; i < rows.length; i++) {
    if (i && rows[i].sign !== '+' && rows[i].sign !== '-') {
      return `row ${i + 1} does not start with a + or a -`
    }
    const bad = rows[i].tokens.find(token => !TOKEN_RE.test(token.trim()))
    if (bad !== undefined) { return `row ${i + 1} has a tile it does not recognise: "${bad}"` }
  }
  return null
}
