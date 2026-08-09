import { fbm, hash2d } from '@/core/noise'

/**
 * Biomes: what the land is, before anyone built on it.
 *
 * The map is an island. Two fields of noise decide everything — elevation, shaped
 * by a falloff towards the edges so the sea always wins there, and moisture, which
 * divides the interior into desert, grassland and forest. Farmland is deliberately
 * not a biome: fields are something people made, so the generator places them on
 * suitable ground the way it places towns.
 *
 * Everything is a pure function of position and seed, in keeping with `core/noise`
 * — any tile's biome can be asked for at any time, in any order.
 */

export const Biome = {
  Ocean: 0,
  Beach: 1,
  Grassland: 2,
  Forest: 3,
  Desert: 4,
} as const

export type BiomeId = (typeof Biome)[keyof typeof Biome]

/** Wavelength, in tiles, of the coastline's large-scale raggedness. */
const COAST_SCALE = 210

/** Wavelength of the moisture field. Large, so deserts arrive as one or two
    regions rather than a rash of patches. */
const MOISTURE_SCALE = 340

/**
 * How much land the island keeps. Elevation fades to nothing at the map edge from
 * this fraction of the way out, so the coast falls where the noise crosses the
 * threshold — different on every bearing, but never off the map.
 */
const SHORE_START = 0.52

/**
 * Elevation before the sea takes its share: 1 at the centre fading to 0 at the map
 * edge, wobbled by noise so the coast is a coastline rather than a rounded square.
 */
export function elevationAt(
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
): number {
  // Chebyshev distance from the centre, 0 there and 1 at the nearest edge. It
  // respects both axes of a non-square map, so the sea border holds all round.
  const nx = Math.abs(x / width - 0.5) * 2
  const ny = Math.abs(y / height - 0.5) * 2
  const edge = Math.max(nx, ny)

  const wobble = fbm(x / COAST_SCALE, y / COAST_SCALE, seed, 4)

  // Past SHORE_START the mask slides from 1 to 0, reaching 0 well before the edge
  // so a margin of open sea always frames the island.
  const mask = 1 - Math.min(1, Math.max(0, (edge - SHORE_START) / (0.92 - SHORE_START)))

  return (0.55 + wobble * 0.45) * mask
}

/** Sea claims everything below this. */
const SEA_LEVEL = 0.34

/** The beach is the elevation band just above the water. */
const BEACH_DEPTH = 0.045

export function biomeAt(
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
): BiomeId {
  const elevation = elevationAt(x, y, width, height, seed)

  if (elevation < SEA_LEVEL) return Biome.Ocean
  if (elevation < SEA_LEVEL + BEACH_DEPTH) return Biome.Beach

  const moisture = fbm(x / MOISTURE_SCALE, y / MOISTURE_SCALE, seed + 7919, 3)

  // Dithered thresholds: a per-tile nudge means the border between two biomes is
  // a ragged mix a few tiles wide rather than a drawn line.
  //
  // The cut points were set by measuring the field's quantiles *over land* rather
  // than assuming it is centred on 0.5. It is not — this fbm's median is nearer
  // 0.6, and land sits in its wetter region besides, so thresholds placed around
  // 0.5 gave an island that was 1% desert. Land at this seed divides roughly 15%
  // desert, 55% grassland, 30% forest.
  const nudge = (hash2d(x, y, seed + 13) - 0.5) * 0.06

  if (moisture + nudge < 0.51) return Biome.Desert
  if (moisture + nudge > 0.66) return Biome.Forest
  return Biome.Grassland
}
