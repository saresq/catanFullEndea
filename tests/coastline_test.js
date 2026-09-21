import test from 'node:test'
import assert from 'node:assert/strict'
import Board from '../public/js/board/board.js'
import * as CONST from '../public/js/const.js'
import { EDGES, beachVariant, ownsCoast } from '../public/js/board/coastline.js'
import { expandSeaBordersAt, parseRows, serializeRows } from '../public/js/board/map_grid.js'

const OPPOSITE = {
  top_left: 'bottom_right', top_right: 'bottom_left', right: 'left',
  bottom_right: 'top_left', bottom_left: 'top_right', left: 'right',
}

const parse = mapkey => new Board(mapkey, [], true)
const allTiles = board => board.tile_rows.flat()

/** Every coast element the board would render, as `id:dir -> variant`. */
function coastline(board) {
  const out = new Map()
  allTiles(board).forEach(tile => EDGES.forEach(dir => {
    if (ownsCoast(tile, dir)) { out.set(`${tile.id}:${dir}`, beachVariant(tile.id, dir)) }
  }))
  return out
}

function paint(mapkey, r, c, token) {
  const rows = parseRows(mapkey)
  rows[r].tokens[c] = token
  return serializeRows(rows)
}

test('coast is drawn on every water-facing edge and nowhere else', () => {
  const board = parse(CONST.DEFAULT_MAPKEY)
  allTiles(board).forEach(tile => EDGES.forEach(dir => {
    const neighbor = tile.adjacent_tiles[dir]
    const land_beside_sea = tile.type === 'S' && neighbor && neighbor.type !== 'S'
    const open_border = tile.type !== 'S' && !neighbor
    assert.equal(ownsCoast(tile, dir), land_beside_sea || open_border,
      `tile ${tile.id} ${dir}`)
  }))
})

test('no edge draws two coast elements', () => {
  CONST.MAP_LIST.forEach(map => {
    const board = parse(map.mapkey)
    allTiles(board).forEach(tile => EDGES.forEach(dir => {
      const neighbor = tile.adjacent_tiles[dir]
      if (!neighbor || !ownsCoast(tile, dir)) { return }
      assert.equal(ownsCoast(neighbor, OPPOSITE[dir]), false,
        `${map.id}: tiles ${tile.id} and ${neighbor.id} both claim their shared ${dir} edge`)
    }))
  })
})

test('the two ownership conditions are mutually exclusive', () => {
  const board = parse(CONST.DEFAULT_MAPKEY)
  allTiles(board).forEach(tile => EDGES.forEach(dir => {
    const neighbor = tile.adjacent_tiles[dir]
    const sea_side = tile.type === 'S' && !!(neighbor && neighbor.type !== 'S')
    const land_side = tile.type !== 'S' && !neighbor
    assert.ok(!(sea_side && land_side), `tile ${tile.id} ${dir} claims its edge twice`)
  }))
})

test('a port keeps its coast and its trade post', () => {
  const board = parse(CONST.DEFAULT_MAPKEY)
  const ports = allTiles(board).filter(t => t.type === 'S' && t.trade_edge)
  assert.ok(ports.length >= 6, 'the default map has its ports')
  ports.forEach(tile => {
    const neighbor = tile.adjacent_tiles[tile.trade_edge]
    assert.ok(neighbor && neighbor.type !== 'S', `port ${tile.id} faces land`)
    assert.ok(ownsCoast(tile, tile.trade_edge), `port ${tile.id} draws coast under its trade post`)
    assert.ok(tile.trade_type && tile.trade_ratio, `port ${tile.id} keeps its trade data`)
  })
})

test('placing land produces coast with no further action', () => {
  // An interior sea tile of the default map, turned to land and expanded the way `changeTile` does.
  const painted = expandSeaBordersAt(paint(CONST.DEFAULT_MAPKEY, 2, 0, 'F5'), 2, 0)
  const board = parse(painted)
  const tile = allTiles(board).find(t => t.generateMapKey() === 'F5')
  EDGES.forEach(dir => {
    const neighbor = tile.adjacent_tiles[dir]
    assert.ok(neighbor, `the expansion gave it a ${dir} neighbour`)
    assert.equal(ownsCoast(neighbor, OPPOSITE[dir]), neighbor.type === 'S',
      `the ${dir} neighbour coasts towards it only if it is water`)
  })
  assert.deepEqual(EDGES.filter(dir => ownsCoast(tile, dir)), [],
    'the land tile itself draws nothing, because it has neighbours on all six edges')
})

test('coast art is identical across a re-render', () => {
  const a = coastline(parse(CONST.DEFAULT_MAPKEY))
  const b = coastline(parse(CONST.DEFAULT_MAPKEY))
  assert.deepEqual([...a.entries()], [...b.entries()])
})

test('editing one tile leaves every other coastline alone', () => {
  const before = parse(CONST.DEFAULT_MAPKEY)
  // `tile_rows[3][3]` is the desert, interior on every side, so the expansion adds no tokens and
  // no tile id moves. Anything that shifts ids would be a different test.
  const edited = expandSeaBordersAt(paint(CONST.DEFAULT_MAPKEY, 3, 3, 'G5'), 3, 3)
  const after = parse(edited)
  assert.equal(allTiles(after).length, allTiles(before).length, 'no tile was added')

  const touched = new Set([before.tile_rows[3][3].id,
    ...EDGES.map(dir => before.tile_rows[3][3].adjacent_tiles[dir]?.id)])
  const a = coastline(before), b = coastline(after)
  a.forEach((variant, key) => {
    if (touched.has(+key.split(':')[0])) { return }
    assert.equal(b.get(key), variant, `${key} kept its coast art`)
  })
})

test('coast variants stay varied', () => {
  const variants = new Set(coastline(parse(CONST.DEFAULT_MAPKEY)).values())
  assert.ok(variants.size > 1, `more than one variant across the map, got ${[...variants]}`)
})

test('a map saved before the land-side coast existed draws exactly the coast it drew before', () => {
  // Land owns an edge only where it has no neighbour at all. Every preset - and every map anyone
  // could have saved from the old editor, which grew sea around land the same way - is fully
  // ringed, so ungating the land branch adds nothing to them.
  CONST.MAP_LIST.forEach(map => {
    const board = parse(map.mapkey)
    const land_owned = allTiles(board).filter(tile => tile.type !== 'S')
      .flatMap(tile => EDGES.filter(dir => ownsCoast(tile, dir)).map(dir => `${tile.id}:${dir}`))
    assert.deepEqual(land_owned, [], `${map.id} draws no coast on a land tile`)
  })
})
