/**
 * Deterministic 2D noise.
 *
 * Everything here is a pure function of position and seed — no sequence, no state.
 * That is a harder discipline than drawing from an RNG in a loop and it is chosen
 * deliberately: a value that depends only on *where* can be asked again in any
 * order, which is what map generation needs the moment any part of it is reworked,
 * and what chunked generation would need on day one if the world ever streams.
 */

/** Uniform in [0, 1), from integer coordinates and a seed. */
export function hash2d(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function smooth(t: number): number {
  // Smoothstep. Linear interpolation leaves visible diamond artefacts along the
  // lattice, which on a map read as geological faults on a grid.
  return t * t * (3 - 2 * t)
}

/**
 * Value noise: a random lattice, smoothly interpolated. In [0, 1).
 *
 * @param x world position divided by the feature wavelength before calling
 */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)

  const top = hash2d(x0, y0, seed) * (1 - fx) + hash2d(x0 + 1, y0, seed) * fx
  const bottom = hash2d(x0, y0 + 1, seed) * (1 - fx) + hash2d(x0 + 1, y0 + 1, seed) * fx
  return top * (1 - fy) + bottom * fy
}

/**
 * Fractal noise: several octaves of value noise summed, each twice the frequency
 * and half the weight of the last. In [0, 1). This is what makes a coastline
 * ragged at every scale instead of smooth at one.
 */
export function fbm(x: number, y: number, seed: number, octaves = 3): number {
  let total = 0
  let weight = 0.5
  let frequency = 1

  let sum = 0
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, y * frequency, seed + i * 101) * weight
    total += weight
    weight /= 2
    frequency *= 2
  }

  return sum / total
}
