# Balanced Dice Algorithm — Expert Summary for Developers

## 1. Context and Motivation

Colonist.io, an online implementation of *Settlers of Catan*, uses virtual dice. Despite using statistically fair random number generation, many players perceived outcomes as unfair due to frequent streaks (e.g., repeated 6s or 8s) and uneven distributions over the course of a game.

Key findings:
- In a 50-roll game, the probability that **some** number appears three times in a row is approximately **57%**, which aligns with player observations but contradicts intuition.
- Statistical analysis confirmed the original RNG was mathematically fair, yet player satisfaction remained low due to perceived imbalance.

This motivated the design of an optional **Balanced Dice** system that preserves randomness while improving perceived fairness.

---

## 2. Original Dice Model

The original model simulates rolling two independent six-sided dice:

```js
die1 = randomInt(1, 6)
die2 = randomInt(1, 6)
sum = die1 + die2
```

The theoretical probability distribution:

| Sum | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|-----|---|---|---|---|---|---|---|---|----|----|----|
| P   | 1/36 | 2/36 | 3/36 | 4/36 | 5/36 | 6/36 | 5/36 | 4/36 | 3/36 | 2/36 | 1/36 |

Monte Carlo simulation over ~1 million games confirmed close alignment with this distribution (within ~1–2% error).

---

## 3. Fairness Evaluation Methods

### 3.1 Goodness-of-Fit Metric

To evaluate dice fairness per game, Colonist used a goodness-of-fit score (0–1 scale) comparing observed roll frequencies to theoretical expectations.

Results:
- Average game fit (pure RNG): ~0.25
- ~61% of games showed very poor fit
- ~200 rolls (≈4 games) are required to naturally approach even distribution

### 3.2 Streak Analysis

Simulations confirmed:
- Frequent doubles and triples are statistically expected
- Perception of unfairness arises from short-term variance, not long-term bias

---

## 4. Algorithmic Techniques Explored

### 4.1 Dice Deck (Sampling Without Replacement)

Model all 36 possible dice outcomes as a deck:

```pseudo
initialize deck = all 36 outcomes
while playing:
    if deck size < K:
        reshuffle deck
    draw outcome uniformly from deck
    remove it
```

Key tuning parameter:
- **K = minimum cards before reshuffle**
- Best performance found with **K ≈ 12–15**

This ensures long-run distribution correctness while limiting extreme variance.

---

### 4.2 Weighted Probability Penalty (Anti-Streak Mechanism)

To reduce consecutive identical rolls, Colonist introduced dynamic probability adjustment.

Let:
- `p_s` = base probability of sum `s`
- `α` = penalty factor (e.g., 0.3)

Then:

\[
w_s =
egin{cases}
(1 - α) p_s, & 	ext{if } s 	ext{ was recently rolled} \
p_s, & 	ext{otherwise}
\end{cases}
\]

Final probability:
\[
P(s) = rac{w_s}{\sum_{t} w_t}
\]

Implementation details:
- Tracks last **5** rolls
- Penalizes recent numbers to reduce streak likelihood

---

## 5. Final Proposed Algorithm

Colonist combined both approaches:

### Configuration:
- Dice deck of 36 outcomes
- Reshuffle when deck size < **13**
- Probability penalty **α = 0.3** for recently rolled sums
- Memory window: **5** recent rolls

### Results:
- Average goodness-of-fit improved to **~0.8**
- Average doubles per game reduced from **~5.43 → ~3.75**
- Maintains correct long-term distribution

---

## 6. Key Findings

| Metric | Pure RNG | Balanced Dice |
|--------|-----------|----------------|
| Avg. Goodness-of-Fit | ~0.25 | ~0.80 |
| Avg. Doubles per Game | ~5.43 | ~3.75 |
| Long-term Distribution | Correct | Correct |
| Player Perception | Often unfair | Significantly improved |

---

## 7. Summary for Developers

The Balanced Dice algorithm:
- Preserves statistical fairness
- Improves short-term distribution smoothness
- Reduces streaks without eliminating randomness
- Is tunable via reshuffle threshold and penalty factor

This makes it suitable for competitive or casual environments where **perceived fairness** is as important as **mathematical correctness**.

---


## 8. JS Example

interface IStandardDiceDeck {
totalDice: number
dicePairs: IDicePair[],
}

interface IWeightedDiceDeck {
totalDice: number,
dicePairs: IDicePair[],
probabilityWeighting: number,
recentlyRolledCount: number,
}

export interface IDicePair {
dice1: number
dice2: number
}

export abstract class DiceController {
abstract throwDice(): IDicePair
}

export class WeightedDiceDeckController extends DiceController {

    private readonly minimumCardsBeforeReshuffling: number
    private readonly probabilityReductionForRecentlyRolled: number

    private weightedDiceDeck: IWeightedDiceDeck[]
    private cardsLeftInDeck: number
    private recentRolls: number[]
    private maximumRecentRollMemory: number

    constructor() {
        super()
        this.initWeightedDiceDeck()
        this.reshuffleWeightedDiceDeck()
        this.updateWeightedDiceDeckProbabilities()

        this.minimumCardsBeforeReshuffling = 13
        this.probabilityReductionForRecentlyRolled = 0.3

        this.recentRolls = []
        this.maximumRecentRollMemory = 5
    }

    throwDice(): IDicePair {
        return this.drawWeightedCard()
    }

    private drawWeightedCard(): IDicePair {
        if(this.cardsLeftInDeck < this.minimumCardsBeforeReshuffling) this.reshuffleWeightedDiceDeck()
        this.updateWeightedDiceDeckProbabilities()
        this.adjustWeightedDiceDeckBasedOnRecentRolls()
        return this.getWeightedDice()
    }

    private initWeightedDiceDeck() {
        this.weightedDiceDeck = []
        this.weightedDiceDeck.push({totalDice: 2, dicePairs: [], probabilityWeighting: 0, recentlyRolledCount: 0})
        this.weightedDiceDeck.push({totalDice: 3, dicePairs: [], probabilityWeighting: 0, recentlyRolledCount: 0})
        this.weightedDiceDeck.push({totalDice: 4, dicePairs: [], probabilityWeighting: 0, recentlyRolledCount: 0})
        this.weightedDiceDeck.push({totalDice: 5, dicePairs: [], probabilityWeighting: 0, recentlyRolledCount: 0})
        this.weightedDiceDeck.push({totalDice: 6, dicePairs: [], probabilityWeighting: 0, recentlyRolledCount: 0})
        this.weightedDiceDeck.push({totalDice: 7, dicePairs: [], probabilityWeighting: 0, recentlyRolledCount: 0})
        this.weightedDiceDeck.push({totalDice: 8, dicePairs: [], probabilityWeighting: 0, recentlyRolledCount: 0})
        this.weightedDiceDeck.push({totalDice: 9, dicePairs: [], probabilityWeighting: 0, recentlyRolledCount: 0})
        this.weightedDiceDeck.push({totalDice: 10, dicePairs: [], probabilityWeighting: 0, recentlyRolledCount: 0})
        this.weightedDiceDeck.push({totalDice: 11, dicePairs: [], probabilityWeighting: 0, recentlyRolledCount: 0})
        this.weightedDiceDeck.push({totalDice: 12, dicePairs: [], probabilityWeighting: 0, recentlyRolledCount: 0})
    }

    private reshuffleWeightedDiceDeck() {
        const standardDiceDeck = this.getStandardDiceDeck()

        for(const [totalDiceIndex, dicePairsForTotalDice] of standardDiceDeck.entries()) {
            this.weightedDiceDeck[totalDiceIndex].dicePairs = dicePairsForTotalDice.dicePairs
        }

        const totalCombinations = 36
        this.cardsLeftInDeck = totalCombinations
    }

    private updateWeightedDiceDeckProbabilities() {
        for(const diceDeckForTotalDice of this.weightedDiceDeck) {
            diceDeckForTotalDice.probabilityWeighting = diceDeckForTotalDice.dicePairs.length / this.cardsLeftInDeck
        }
    }

    private getWeightedDice(): IDicePair {
        const totalProbabilityWeight = this.getTotalProbabilityWeight()

        let targetRandomNumber = Math.random() * totalProbabilityWeight
        for(const diceDeckForTotalDice of this.weightedDiceDeck) {
            if(targetRandomNumber <= diceDeckForTotalDice.probabilityWeighting) {
                const drawnCard = randomElementFromArray(diceDeckForTotalDice.dicePairs)
                removeElementFromArray(diceDeckForTotalDice.dicePairs, drawnCard)

                this.recentRolls.push(diceDeckForTotalDice.totalDice)
                diceDeckForTotalDice.recentlyRolledCount ++
                this.cardsLeftInDeck --

                if(this.recentRolls.length > this.maximumRecentRollMemory) this.updateRecentlyRolled()
                return drawnCard
            }
            targetRandomNumber -= diceDeckForTotalDice.probabilityWeighting
        }

        JL4('Something seriously wrong with weighted dice deck')
        const defaultRollIfError = {dice1: 3, dice2: 4}
        return defaultRollIfError
    }

    private getTotalProbabilityWeight(): number {
        let totalProbabilityWeight = 0
        for(const dicePairs of this.weightedDiceDeck) {
            totalProbabilityWeight += dicePairs.probabilityWeighting
        }

        return totalProbabilityWeight
    }

    private updateRecentlyRolled() {
        const ignore0and1 = 2
        const totalDiceFiveRollsAgo = this.recentRolls[0]
        this.weightedDiceDeck[totalDiceFiveRollsAgo - ignore0and1].recentlyRolledCount --
        this.recentRolls.shift()
    }

    private adjustWeightedDiceDeckBasedOnRecentRolls() {
        for(const diceDeckForTotalDice of this.weightedDiceDeck) {
            const probabilityReduction = (diceDeckForTotalDice.recentlyRolledCount * this.probabilityReductionForRecentlyRolled)
            const probabilityMultiplier = 1 - probabilityReduction
            diceDeckForTotalDice.probabilityWeighting *= probabilityMultiplier
            if(diceDeckForTotalDice.probabilityWeighting < 0) diceDeckForTotalDice.probabilityWeighting = 0
        }
    }

    private getStandardDiceDeck(): IStandardDiceDeck[] {
        const standardDiceDeck: IStandardDiceDeck[] = []
        standardDiceDeck.push({totalDice: 2, dicePairs: [{dice1: 1, dice2: 1}]})
        standardDiceDeck.push({totalDice: 3, dicePairs: [{dice1: 1, dice2: 2}, {dice1: 2, dice2: 1}]})
        standardDiceDeck.push({totalDice: 4, dicePairs: [{dice1: 1, dice2: 3}, {dice1: 2, dice2: 2}, {dice1: 3, dice2: 1}]})
        standardDiceDeck.push({totalDice: 5, dicePairs: [{dice1: 1, dice2: 4}, {dice1: 2, dice2: 3}, {dice1: 3, dice2: 2}, {dice1: 4, dice2: 1}]})
        standardDiceDeck.push({totalDice: 6, dicePairs: [{dice1: 1, dice2: 5}, {dice1: 2, dice2: 4}, {dice1: 3, dice2: 3}, {dice1: 4, dice2: 2}, {dice1: 5, dice2: 1}]})
        standardDiceDeck.push({totalDice: 7, dicePairs: [{dice1: 1, dice2: 6}, {dice1: 2, dice2: 5}, {dice1: 3, dice2: 4}, {dice1: 4, dice2: 3}, {dice1: 5, dice2: 2}, {dice1: 6, dice2: 1}]})
        standardDiceDeck.push({totalDice: 8, dicePairs: [{dice1: 2, dice2: 6}, {dice1: 3, dice2: 5}, {dice1: 4, dice2: 4}, {dice1: 5, dice2: 3}, {dice1: 6, dice2: 2}]})
        standardDiceDeck.push({totalDice: 9, dicePairs: [{dice1: 3, dice2: 6}, {dice1: 4, dice2: 5}, {dice1: 5, dice2: 4}, {dice1: 6, dice2: 3}]})
        standardDiceDeck.push({totalDice: 10, dicePairs: [{dice1: 4, dice2: 6}, {dice1: 5, dice2: 5}, {dice1: 6, dice2: 4}]})
        standardDiceDeck.push({totalDice: 11, dicePairs: [{dice1: 5, dice2: 6}, {dice1: 6, dice2: 5}]})
        standardDiceDeck.push({totalDice: 12, dicePairs: [{dice1: 6, dice2: 6}]})

        return standardDiceDeck
    }
}

export function randomElementFromArray<T>(array: T[]): T {
return array[Math.floor(Math.random() * array.length)]
}

export function removeElementFromArray<T>(array: T[], element: T): boolean {
const index = array.indexOf(element)
if(index > -1) {
array.splice(index, 1)
return true
}
return false
}