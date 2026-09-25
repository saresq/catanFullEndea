import test from 'node:test'
import assert from 'node:assert/strict'
import Board from '../public/js/board/board.js'
import BoardShuffler from '../public/js/board/board_shuffler.js'
import * as CONST from '../public/js/const.js'

/** Each tile's type and number, in board order. */
const layout = mapkey => new Board(mapkey, [], true).tile_rows.flat()
  .filter(t => t.type !== 'S').map(t => ({ type: t.type, num: t.num || null }))

Object.keys(CONST.MAPS).forEach(id => {
  test(`${id}: shuffling only the resources leaves every number and desert where it was`, () => {
    const before = layout(CONST.MAPS[id].mapkey)
    for (let i = 0; i < 20; i++) {
      const after = layout(new BoardShuffler(CONST.MAPS[id].mapkey).shuffle('tile'))
      assert.deepEqual(after.map(t => t.num), before.map(t => t.num))
      assert.deepEqual(after.map(t => t.type === 'D'), before.map(t => t.type === 'D'))
      assert.deepEqual(after.map(t => t.type).sort(), before.map(t => t.type).sort())
    }
  })
})

/** Neighbouring pairs that both carry a 6 or an 8. */
const redClashes = mapkey => {
  const red = t => t && t.type !== 'S' && t.type !== 'D' && CONST.RED_NUMBERS.includes(+t.num)
  const tiles = new Board(mapkey, [], true).tile_rows.flat().filter(red)
  return tiles.reduce((n, t) => n + Object.values(t.adjacent_tiles).filter(red).length, 0) / 2
}

Object.keys(CONST.MAPS).forEach(id => {
  test(`${id}: shuffling the land never puts a 6 or an 8 next to another`, () => {
    for (let i = 0; i < 30; i++) {
      assert.equal(redClashes(new BoardShuffler(CONST.MAPS[id].mapkey).shuffle('tile-number')), 0)
    }
  })
})
