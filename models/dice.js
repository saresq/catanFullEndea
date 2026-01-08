// Dice strategies for the server-side game engine
// Provides Random and Balanced dice implementations and a factory to create them

const clamp = (num, min, max) => Math.max(min, Math.min(max, num))

class RandomDice {
  roll(avoidTotals = []) {
    let d1 = Math.ceil(Math.random() * 6)
    let d2 = Math.ceil(Math.random() * 6)
    while (avoidTotals?.includes(d1 + d2)) {
      d1 = Math.ceil(Math.random() * 6)
      d2 = Math.ceil(Math.random() * 6)
    }
    return { d1, d2 }
  }
}

class BalancedDice {
  constructor(options = {}) {
    const {
      minimumCardsBeforeReshuffle = 12, // reshuffle threshold
      recentMemory = 5,                 // how many recent totals to remember
      recencyReduction = 0.30,          // ~30% reduction per recent hit
    } = options

    this.minimumCardsBeforeReshuffle = minimumCardsBeforeReshuffle
    this.recentMemory = recentMemory
    this.recencyReduction = recencyReduction

    this.recentRolls = [] // queue of recent totals

    // Deck grouped by totals 2..12 with their (d1,d2) pairs
    this.deckByTotal = []
    for (let t = 2; t <= 12; t++) this.deckByTotal.push({ total: t, pairs: [], weight: 0, recentCount: 0 })

    this._reshuffle()
    this._updateBaseWeights()
  }

  roll(avoidTotals = []) {
    // Reshuffle if needed
    if (this.cardsLeft < this.minimumCardsBeforeReshuffle) {
      this._reshuffle()
      this._updateBaseWeights()
    }

    // Compute dynamic weights considering recency and avoids
    const weights = []
    let totalWeight = 0
    for (const entry of this.deckByTotal) {
      // If no cards of this total remain or it is avoided for this roll, weight is 0
      if (!entry.pairs.length || (avoidTotals && avoidTotals.includes(entry.total))) {
        weights.push(0)
        continue
      }
      // Start from base weight
      let w = entry.weight
      // Apply recency reduction per recent hit (bounded)
      const reduction = clamp(entry.recentCount * this.recencyReduction, 0, 0.95)
      w = w * (1 - reduction)
      if (w < 0) w = 0
      weights.push(w)
      totalWeight += w
    }

    // Fallback: if for some reason totalWeight is 0 (e.g., avoids too strict), ignore avoids
    if (totalWeight <= 0) {
      totalWeight = 0
      for (let i = 0; i < this.deckByTotal.length; i++) {
        const entry = this.deckByTotal[i]
        const w = entry.pairs.length ? entry.weight : 0
        weights[i] = w
        totalWeight += w
      }
    }

    // Select a total according to dynamic weights
    let r = Math.random() * totalWeight
    let chosenIndex = -1
    for (let i = 0; i < this.deckByTotal.length; i++) {
      if (r <= weights[i]) { chosenIndex = i; break }
      r -= weights[i]
    }

    // Safety fallback
    if (chosenIndex < 0) {
      // pick first available
      chosenIndex = this.deckByTotal.findIndex(e => e.pairs.length)
      if (chosenIndex < 0) {
        // This should never happen, but just in case
        this._reshuffle(); this._updateBaseWeights()
        chosenIndex = this.deckByTotal.findIndex(e => e.pairs.length)
      }
    }

    const chosenEntry = this.deckByTotal[chosenIndex]
    const pairIndex = Math.floor(Math.random() * chosenEntry.pairs.length)
    const { d1, d2 } = chosenEntry.pairs.splice(pairIndex, 1)[0]

    // Update state
    this.cardsLeft -= 1
    this._pushRecent(chosenEntry.total)
    this._updateBaseWeights() // base weights depend only on counts remaining

    return { d1, d2 }
  }

  _pushRecent(total) {
    this.recentRolls.push(total)
    // Increment recentCount for this total
    this._byTotal(total).recentCount += 1
    // Trim memory and decrement the outgoing total's recentCount
    while (this.recentRolls.length > this.recentMemory) {
      const old = this.recentRolls.shift()
      this._byTotal(old).recentCount = Math.max(0, this._byTotal(old).recentCount - 1)
    }
  }

  _byTotal(total) {
    // totals are 2..12, index offset = 2
    return this.deckByTotal[total - 2]
  }

  _reshuffle() {
    // Build full standard 36-card deck grouped by total
    for (let i = 0; i < this.deckByTotal.length; i++) {
      this.deckByTotal[i].pairs = []
      this.deckByTotal[i].recentCount = 0
    }
    for (let d1 = 1; d1 <= 6; d1++) {
      for (let d2 = 1; d2 <= 6; d2++) {
        const total = d1 + d2
        this._byTotal(total).pairs.push({ d1, d2 })
      }
    }
    this.cardsLeft = 36
    this.recentRolls.length = 0
  }

  _updateBaseWeights() {
    // Base weights proportional to remaining pairs for each total, normalized over cardsLeft
    const left = Math.max(1, this.cardsLeft)
    for (const entry of this.deckByTotal) {
      entry.weight = entry.pairs.length / left
    }
  }
}

export function createDice(mode = 'random', options = {}) {
  if (mode === 'balanced') return new BalancedDice(options)
  return new RandomDice()
}
