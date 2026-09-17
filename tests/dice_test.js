// Invariants for both dice engines. Statistical bounds are deliberately loose
// so a legitimately unlucky run never fails the suite.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createDice } from '../models/dice.js'

const ROLLS = 5000

function rollMany(mode, count = ROLLS, avoidTotals = []) {
  const dice = createDice(mode)
  const counts = {}
  for (let t = 2; t <= 12; t++) counts[t] = 0
  for (let i = 0; i < count; i++) {
    const { d1, d2 } = dice.roll(avoidTotals)
    assert.ok(Number.isInteger(d1) && d1 >= 1 && d1 <= 6, `d1 out of range: ${d1}`)
    assert.ok(Number.isInteger(d2) && d2 >= 1 && d2 <= 6, `d2 out of range: ${d2}`)
    counts[d1 + d2]++
  }
  return counts
}

for (const mode of ['random', 'balanced']) {
  test(`${mode} dice`, async t => {
    const counts = rollMany(mode)
    const total = Object.values(counts).reduce((sum, c) => sum + c, 0)
    const pct = n => (counts[n] / ROLLS) * 100

    await t.test('every roll lands on a valid total', () => {
      assert.equal(total, ROLLS)
      assert.deepEqual(Object.keys(counts).map(Number).sort((a, b) => a - b),
        [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    })

    await t.test('the whole range shows up', () => {
      for (let n = 2; n <= 12; n++) assert.ok(counts[n] > 0, `total ${n} never rolled`)
    })

    await t.test('roughly bell shaped', () => {
      assert.ok(pct(7) > 8 && pct(7) < 25, `7 rolled ${pct(7).toFixed(2)}% of the time`)
      assert.ok(pct(2) < 10, `2 rolled ${pct(2).toFixed(2)}% of the time`)
      assert.ok(pct(12) < 10, `12 rolled ${pct(12).toFixed(2)}% of the time`)
      assert.ok(counts[7] > counts[2], '7 should beat 2 over 5000 rolls')
      assert.ok(counts[7] > counts[12], '7 should beat 12 over 5000 rolls')
    })

    await t.test('avoidTotals is honored', () => {
      const avoided = rollMany(mode, 500, [7])
      assert.equal(avoided[7], 0, 'rolled a 7 while avoiding it')
    })
  })
}
