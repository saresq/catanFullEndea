// Card counting from what every seat is told. `known[pid][res]` are cards the table has seen a
// player receive and not seen leave; `unknown[pid]` are cards whose identity the table lost (a
// steal, a random discard). The public `resource_count` is the ceiling, reconciled every read, so
// the count can drift below reality but never above what is public. Nothing here reads a hand.
import * as CONST from '../../public/js/const.js'

const RES = Object.keys(CONST.RESOURCES)
const zero = () => Object.fromEntries(RES.map(r => [r, 0]))
const total = obj => Object.values(obj).reduce((m, v) => m + v, 0)

export default class Tracker {
  known = {}   // pid -> { res: n }
  unknown = {} // pid -> n

  #hand(pid) {
    if (!this.known[pid]) { this.known[pid] = zero(); this.unknown[pid] = 0 }
    return this.known[pid]
  }

  #give(pid, cards = {}) {
    const hand = this.#hand(pid)
    Object.entries(cards).forEach(([res, n]) => { if (hand[res] !== undefined) hand[res] += n || 0 })
  }

  /** Cards seen leaving: known first, then the unknown pool absorbs the rest. */
  #take(pid, cards = {}) {
    const hand = this.#hand(pid)
    Object.entries(cards).forEach(([res, n]) => {
      if (hand[res] === undefined) return
      const from_known = Math.min(hand[res], n || 0)
      hand[res] -= from_known
      this.unknown[pid] = Math.max(0, this.unknown[pid] - ((n || 0) - from_known))
    })
  }

  /** One card of no known identity moves: `from` loses one from anywhere, `to` gains an unknown. */
  #blind(from, to, count = 1) {
    this.#hand(from); this.#hand(to)
    for (let i = 0; i < count; i++) {
      if (this.unknown[from] > 0) { this.unknown[from]-- }
      else {
        // The biggest known pile is the likeliest to have been hit
        const res = RES.reduce((m, r) => this.known[from][r] > (this.known[from][m] || 0) ? r : m, RES[0])
        if (this.known[from][res] > 0) { this.known[from][res]-- }
      }
      this.unknown[to]++
    }
  }

  /** @param {object} event as fired by `Game.onPublic` */
  observe(event) {
    switch (event.type) {
      case 'roll': (event.payout || []).forEach(({ pid, res }) => this.#give(pid, res)); break
      case 'initial_yield': this.#give(event.pid, event.res); break
      case 'bank_trade': this.#take(event.pid, event.giving); this.#give(event.pid, event.taking); break
      case 'player_trade':
        this.#take(event.pid, event.giving); this.#give(event.pid, event.taking)
        this.#give(event.with, event.giving); this.#take(event.with, event.taking)
        break
      case 'buy': this.#take(event.pid, CONST.COST[event.what] || {}); break
      case 'steal': this.#blind(event.from, event.pid); break
      case 'discard': {
        // Half the hand, identity unknown: drop from the unknown pool first, then knowns pro rata
        this.#hand(event.pid)
        let left = event.count || 0
        const from_unknown = Math.min(this.unknown[event.pid], left)
        this.unknown[event.pid] -= from_unknown; left -= from_unknown
        while (left > 0 && total(this.known[event.pid]) > 0) {
          const res = RES.reduce((m, r) => this.known[event.pid][r] > this.known[event.pid][m] ? r : m, RES[0])
          this.known[event.pid][res]--; left--
        }
        break
      }
      case 'monopoly':
        // Everyone else is left with none of that resource; the taker holds them all
        Object.keys(this.known).forEach(pid => { if (+pid !== event.pid) this.known[pid][event.res] = 0 })
        this.#give(event.pid, { [event.res]: event.total })
        break
      case 'year_of_plenty': this.#hand(event.pid); this.unknown[event.pid] += event.count || 2; break
    }
  }

  /** Clamp to the public card count: known cards beyond it are stale, a shortfall is unknown. */
  reconcile(players) {
    players.forEach(p => {
      const hand = this.#hand(p.id)
      let over = total(hand) + this.unknown[p.id] - p.resource_count
      while (over > 0) {
        if (this.unknown[p.id] > 0) { this.unknown[p.id]--; over--; continue }
        const res = RES.reduce((m, r) => hand[r] > hand[m] ? r : m, RES[0])
        if (hand[res] <= 0) break
        hand[res]--; over--
      }
      if (over < 0) { this.unknown[p.id] -= over }
    })
  }

  /** Frozen copy for a view: `{ known, unknown, likely(pid, res) }`. */
  snapshot(production = {}) {
    const known = JSON.parse(JSON.stringify(this.known))
    Object.values(known).forEach(hand => Object.freeze(hand))
    const unknown = Object.freeze({ ...this.unknown })
    const likely = (pid, res) => {
      const k = known[pid]?.[res] || 0
      const prod = production[pid]
      if (!unknown[pid] || !prod) return k
      const sum = total(prod)
      return k + (sum ? unknown[pid] * (prod[res] || 0) / sum : unknown[pid] / RES.length)
    }
    return Object.freeze({ known, unknown, likely })
  }
}
