// Dice strategies for the server-side game engine
// Provides Random and Balanced dice implementations and a factory to create them

import crypto from 'node:crypto';

const clamp = (num, min, max) => Math.max(min, Math.min(max, num))

class RandomDice {
  roll(avoidTotals = []) {
    let d1 = crypto.randomInt(1, 7)
    let d2 = crypto.randomInt(1, 7)
    while (avoidTotals?.includes(d1 + d2)) {
      d1 = crypto.randomInt(1, 7)
      d2 = crypto.randomInt(1, 7)
    }
    return { d1, d2 }
  }
}

class BalancedDice {
  constructor(options = {}) {
    this.minimumCardsBeforeReshuffling = options.minimumCardsBeforeReshuffle || 13
    this.probabilityReductionForRecentlyRolled = options.recencyReduction || 0.3
    this.maximumRecentRollMemory = options.recentMemory || 5

    this.weightedDiceDeck = []
    this.cardsLeftInDeck = 0
    this.recentRolls = []

    this._initWeightedDiceDeck()
    this._reshuffle()
  }

  _initWeightedDiceDeck() {
    this.weightedDiceDeck = []
    for (let t = 2; t <= 12; t++) {
      this.weightedDiceDeck.push({
        totalDice: t,
        dicePairs: [],
        probabilityWeighting: 0,
        recentlyRolledCount: 0
      })
    }
  }

  _reshuffle() {
    const standardDeck = this._getStandardDiceDeck()
    for (let i = 0; i < standardDeck.length; i++) {
      this.weightedDiceDeck[i].dicePairs = [...standardDeck[i].dicePairs]
    }
    this.cardsLeftInDeck = 36
  }

  _getStandardDiceDeck() {
    const deck = []
    for (let t = 2; t <= 12; t++) {
      deck.push({ totalDice: t, dicePairs: [] })
    }
    for (let d1 = 1; d1 <= 6; d1++) {
      for (let d2 = 1; d2 <= 6; d2++) {
        const total = d1 + d2
        deck[total - 2].dicePairs.push({ d1, d2 })
      }
    }
    return deck
  }

  roll(avoidTotals = []) {
    if (this.cardsLeftInDeck < this.minimumCardsBeforeReshuffling) {
      this._reshuffle()
    }

    this._updateProbabilities()
    this._adjustForRecentRolls()
    
    // Support avoidTotals (required by game logic)
    if (avoidTotals && avoidTotals.length > 0) {
      for (const entry of this.weightedDiceDeck) {
        if (avoidTotals.includes(entry.totalDice)) {
          entry.probabilityWeighting = 0
        }
      }
    }

    let totalWeight = this._getTotalWeight()

    // Fallback if all weights are 0 (e.g. too many avoidTotals)
    if (totalWeight <= 0) {
      this._updateProbabilities() // reset to base
      totalWeight = this._getTotalWeight()
    }

    let r = (crypto.randomBytes(4).readUInt32BE(0) / 0x100000000) * totalWeight
    for (const entry of this.weightedDiceDeck) {
      if (r <= entry.probabilityWeighting) {
        const pairIndex = entry.dicePairs.length > 0 ? crypto.randomInt(0, entry.dicePairs.length) : 0
        const pair = entry.dicePairs.splice(pairIndex, 1)[0]
        
        this.cardsLeftInDeck--
        this._pushRecent(entry.totalDice)
        
        return pair
      }
      r -= entry.probabilityWeighting
    }

    // Safety fallback
    const available = this.weightedDiceDeck.find(e => e.dicePairs.length > 0)
    const pair = available.dicePairs.splice(0, 1)[0]
    this.cardsLeftInDeck--
    this._pushRecent(available.totalDice)
    return pair
  }

  _updateProbabilities() {
    for (const entry of this.weightedDiceDeck) {
      entry.probabilityWeighting = entry.dicePairs.length / this.cardsLeftInDeck
    }
  }

  _adjustForRecentRolls() {
    for (const entry of this.weightedDiceDeck) {
      const reduction = entry.recentlyRolledCount * this.probabilityReductionForRecentlyRolled
      entry.probabilityWeighting *= (1 - reduction)
      if (entry.probabilityWeighting < 0) entry.probabilityWeighting = 0
    }
  }

  _getTotalWeight() {
    return this.weightedDiceDeck.reduce((sum, entry) => sum + entry.probabilityWeighting, 0)
  }

  _pushRecent(total) {
    this.recentRolls.push(total)
    this.weightedDiceDeck[total - 2].recentlyRolledCount++

    if (this.recentRolls.length > this.maximumRecentRollMemory) {
      const oldTotal = this.recentRolls.shift()
      this.weightedDiceDeck[oldTotal - 2].recentlyRolledCount--
    }
  }
}

export function createDice(mode = 'random', options = {}) {
  if (mode === 'balanced') return new BalancedDice(options)
  return new RandomDice()
}
