/**
 * Seeded pseudo-random numbers.
 *
 * The world generator must be reproducible: the same seed has to produce the same
 * town every time, or a bug seen once can never be looked at again. `Math.random`
 * cannot do that, so this is a small deterministic generator instead.
 *
 * mulberry32 — fast, tiny, and good enough for placing buildings. It is not
 * cryptographic and is not meant to be.
 */

export interface Rng {
  /** A float in [0, 1). */
  next(): number
  /** An integer in [min, max], inclusive. */
  int(min: number, max: number): number
  /** True with the given probability. */
  chance(probability: number): boolean
  /** One item from a non-empty list. */
  pick<T>(items: readonly T[]): T
}

export function createRng(seed: number): Rng {
  // Any seed works, but 0 would leave the state stuck, so it is nudged off zero.
  let state = seed || 0x9e3779b9

  const next = (): number => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0

    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,

    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1))
    },

    chance(probability: number): boolean {
      return next() < probability
    },

    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)]
      if (item === undefined) throw new Error('Cannot pick from an empty list')
      return item
    },
  }
}
