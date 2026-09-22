import test from 'node:test'
import assert from 'node:assert/strict'
import Board from '../public/js/board/board.js'
import * as CONST from '../public/js/const.js'
import {
  expandSeaBordersAt, gridShift, growBottom, growLeft, growRight, growTop, parseRows, serializeRows,
} from '../public/js/board/map_grid.js'

/** Corners and edges cost far more than the adjacency the geometry tests read. */
const parse = mapkey => new Board(mapkey, [], true)

/**
 * Every tile with its absolute x in tile widths, `½ · Σ d_k + j`, mirroring the pixel offset
 * `board_ui.js:52,57,63` accumulates. This is the only position that means anything: a row has
 * no independent origin, so a row-local index says nothing on its own.
 */
function tilesWithX(board) {
  const out = []
  let startDiff = 0
  board.tile_rows.forEach((row, i) => {
    startDiff += (row.diff || 0)
    row.forEach((tile, j) => out.push({ tile, row: i, index: j, x: startDiff / 2 + j }))
  })
  return out
}

/**
 * The tiles an expansion may not lose track of, keyed so the same tile is findable before and
 * after. Expansion only ever inserts plain `S` tokens, so the k-th tile carrying a given
 * non-plain-sea label is the same tile on both sides.
 */
function anchors(mapkey) {
  const seen = new Map()
  const found = new Map()
  tilesWithX(parse(mapkey)).forEach(entry => {
    const label = entry.tile.generateMapKey()
    if (label === 'S') { return }
    const k = seen.get(label) || 0
    seen.set(label, k + 1)
    found.set(`${label}#${k}`, entry)
  })
  return found
}

/** Every pre-existing tile keeps its position relative to every other. */
function assertUniformTranslation(before, after, label) {
  const a = anchors(before), b = anchors(after)
  const deltas = new Set()
  a.forEach((entry, key) => {
    assert.ok(b.has(key), `${label}: ${key} survived the expansion`)
    deltas.add(b.get(key).x - entry.x)
  })
  assert.ok(a.size > 0, `${label}: something to compare`)
  assert.equal(deltas.size, 1,
    `${label}: the whole board moved as one, not by ${[...deltas].sort().join(', ')}`)
}

const findByLabel = (board, label) =>
  tilesWithX(board).find(e => e.tile.generateMapKey() === label)?.tile

/** Turn a tile into land in the mapkey, the way `changeTile()` does, without touching anything else. */
function paint(mapkey, r, c, token) {
  const rows = parseRows(mapkey)
  rows[r].tokens[c] = token
  return serializeRows(rows)
}

const PRESETS = Object.entries(CONST).filter(([k, v]) =>
  typeof v === 'string' && /MAPKEY/.test(k) && v.includes('\n'))

test('absolute x follows the running sum of row signs', () => {
  // Row 0 has no sign and counts as +1, so the origins run 0.5, 0, -0.5, 0.
  const board = parse('S.S\n+S.S\n-S.S\n-S.S')
  const rows = [[], [], [], []]
  tilesWithX(board).forEach(e => rows[e.row].push(e.x))
  assert.deepEqual(rows, [[0.5, 1.5], [1, 2], [0.5, 1.5], [0, 1]])
})

test('a leftmost land tile ends up with all six neighbours', () => {
  // `tile_rows[1][0]` of the default map is the leftmost tile of a row that has nothing to its
  // left, above-left or below-left. Placing land there has to grow the grid leftwards.
  const painted = paint(CONST.DEFAULT_MAPKEY, 1, 0, 'F5')
  const board = parse(expandSeaBordersAt(painted, 1, 0))
  const tile = findByLabel(board, 'F5')
  assert.ok(tile, 'the painted tile is still there')
  const missing = ['left', 'right', 'top_left', 'top_right', 'bottom_left', 'bottom_right']
    .filter(dir => !tile.adjacent_tiles[dir])
  assert.deepEqual(missing, [], 'every direction has a neighbour')
})

test('editing a column-zero tile does not re-parent a port', () => {
  // The `S(br_*3)` port's bottom-right neighbour is `M10`. A per-row unshift slides row 1 one
  // full tile right and the port silently points at `G2` instead.
  const before = parse(CONST.DEFAULT_MAPKEY)
  assert.equal(findByLabel(before, 'S(br_*3)').adjacent_tiles.bottom_right.generateMapKey(), 'M10')

  const painted = paint(CONST.DEFAULT_MAPKEY, 1, 0, 'F5')
  const after = parse(expandSeaBordersAt(painted, 1, 0))
  assert.equal(findByLabel(after, 'S(br_*3)').adjacent_tiles.bottom_right.generateMapKey(), 'M10')
})

test('expansion moves the whole board or nothing', () => {
  const mapkey = CONST.DEFAULT_MAPKEY
  const rows = parseRows(mapkey)
  rows.forEach((row, r) => row.tokens.forEach((_, c) => {
    assertUniformTranslation(mapkey, expandSeaBordersAt(mapkey, r, c), `expand at (${r},${c})`)
  }))
})

test('growLeft adds a column and touches no sign', () => {
  const mapkey = CONST.DEFAULT_MAPKEY
  const before = parseRows(mapkey)
  const after = parseRows(growLeft(mapkey))

  assert.deepEqual(after.map(r => r.sign), before.map(r => r.sign), 'the sign sequence is identical')
  assert.deepEqual(after.map(r => r.tokens.length), before.map(r => r.tokens.length + 1))
  assert.deepEqual(after.map(r => r.tokens[0]), before.map(() => 'S'), 'every new cell is plain sea')
  assertUniformTranslation(mapkey, growLeft(mapkey), 'growLeft')
})

test('growLeft is unbounded', () => {
  let mapkey = CONST.DEFAULT_MAPKEY
  const width = parseRows(mapkey).map(r => r.tokens.length)
  for (let n = 0; n < 5; n++) { mapkey = growLeft(mapkey) }
  assert.deepEqual(parseRows(mapkey).map(r => r.tokens.length), width.map(w => w + 5))
  assertUniformTranslation(CONST.DEFAULT_MAPKEY, mapkey, 'growLeft x5')
})

test('expansion is pure', () => {
  const a = expandSeaBordersAt(CONST.DEFAULT_MAPKEY, 1, 0)
  const b = expandSeaBordersAt(CONST.DEFAULT_MAPKEY, 1, 0)
  assert.equal(a, b)
})

test('every preset survives expansion at each extreme', () => {
  assert.ok(PRESETS.length >= 5, 'the presets were found')
  PRESETS.forEach(([name, mapkey]) => {
    const rows = parseRows(mapkey)
    const spots = []
    for (const r of [0, rows.length - 1]) {
      for (const c of [0, rows[r].tokens.length - 1]) { spots.push([r, c]) }
    }
    spots.forEach(([r, c]) => {
      const grown = expandSeaBordersAt(mapkey, r, c)
      const board = parse(grown)
      const expected = parseRows(grown).reduce((n, row) => n + row.tokens.length, 0)
      assert.equal(tilesWithX(board).length, expected, `${name} (${r},${c}) re-parses`)
      assertUniformTranslation(mapkey, grown, `${name} (${r},${c})`)

      const painted = paint(mapkey, r, c, 'F5')
      const tile = findByLabel(parse(expandSeaBordersAt(painted, r, c)), 'F5')
      const missing = ['left', 'right', 'top_left', 'top_right', 'bottom_left', 'bottom_right']
        .filter(dir => !tile.adjacent_tiles[dir])
      assert.deepEqual(missing, [], `${name} (${r},${c}) rings the painted tile with sea`)
    })
  })
})

test('the grid grows on every side, repeatably, without moving anything', () => {
  const grow = { growLeft, growRight, growTop, growBottom }
  Object.entries(grow).forEach(([name, fn]) => {
    let mapkey = CONST.DEFAULT_MAPKEY
    const before = parseRows(mapkey)
    for (let n = 0; n < 3; n++) { mapkey = fn(mapkey) }
    const after = parseRows(mapkey)

    const rows_added = /Top|Bottom/.test(name) ? 3 : 0
    const cols_added = rows_added ? 0 : 3
    assert.equal(after.length, before.length + rows_added, `${name} added ${rows_added} rows`)
    assertUniformTranslation(CONST.DEFAULT_MAPKEY, mapkey, name)

    if (cols_added) {
      assert.deepEqual(after.map(r => r.tokens.length), before.map(r => r.tokens.length + 3))
      const edge = name === 'growLeft' ? row => row.tokens.slice(0, 3) : row => row.tokens.slice(-3)
      after.forEach(row => assert.deepEqual(edge(row), ['S', 'S', 'S'], `${name} added only sea`))
    } else {
      const added = name === 'growTop' ? after.slice(0, 3) : after.slice(-3)
      added.forEach(row => assert.ok(row.tokens.every(t => t === 'S'), `${name} added only sea`))
    }
  })
})

test('gridShift reads how the shared tiles moved between two grids', () => {
  const mapkey = CONST.DEFAULT_MAPKEY
  const same = gridShift(mapkey, mapkey)
  assert.deepEqual([same.rows, same.cols], [0, 0], 'an unchanged grid does not move')

  // Growth in each direction, one and three at a time, in both directions of time.
  const cases = [
    [growLeft(mapkey), 0, 1], [growLeft(mapkey, 3), 0, 3],
    [growRight(mapkey), 0, 0], [growTop(mapkey), 1, 0], [growTop(mapkey, 3), 3, 0],
    [growBottom(mapkey), 0, 0], [growTop(growLeft(mapkey)), 1, 1],
  ]
  cases.forEach(([grown, rows, cols], i) => {
    const there = gridShift(mapkey, grown)
    assert.equal(there.rows, rows, `case ${i}: rows`)
    assert.equal(there.cols, cols, `case ${i}: cols`)
    const back = gridShift(grown, mapkey)
    assert.equal(back.rows, -rows || 0, `case ${i}: rows, undone`)
    assert.equal(back.cols, -cols || 0, `case ${i}: cols, undone`)
  })

  // The anchor is a tile that is really there on both sides, and not sea.
  const grown = growTop(growLeft(mapkey))
  const { rows, cols, anchor: [r, c] } = gridShift(mapkey, grown)
  const token = parseRows(mapkey)[r].tokens[c]
  assert.notEqual(token, 'S')
  assert.equal(parseRows(grown)[r + rows].tokens[c + cols], token)
})

test('gridShift anchors on the tile just painted when it is the only land', () => {
  const written = paint('S.S.S\n-S.S.S\n-S.S.S', 1, 0, 'F5')
  const grown = expandSeaBordersAt(written, 1, 0)
  assert.deepEqual(gridShift(written, grown), { rows: 0, cols: 1, anchor: [1, 0] })
  assert.equal(gridShift('S.S.S\n-S.S.S', growLeft('S.S.S\n-S.S.S')), null, 'all sea anchors nothing')
})
