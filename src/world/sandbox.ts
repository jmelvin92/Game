import { createRng, type Rng } from '@/core/rng'
import { archetypesFor, placeBuilding } from '@/world/buildings'
import { District, districtAt, districtDef, type DistrictId } from '@/world/districts'
import { createGrid, type Grid } from '@/world/grid'
import { LampState, Prop, PROP_VARIANTS } from '@/world/props'
import { Tile } from '@/world/tiles'

/**
 * Generates the town.
 *
 * A street grid divides the map into blocks; each block becomes a lot; each lot gets
 * a building drawn from whatever suits the district it falls in. That ordering is
 * what gives the place coherence — industry ends up together on the edge, shops
 * cluster where the roads cross, and houses fill the rest.
 *
 * Seeded throughout, so the same seed always produces the same town. Without that a
 * layout bug seen once could never be looked at again.
 */

export const SANDBOX_SIZE = 128
export const SANDBOX_SEED = 20260808

/** Tiles between road centrelines. */
const BLOCK = 32
const ROAD_WIDTH = 4
const PAVEMENT = 2

export const SPAWN = { x: SANDBOX_SIZE / 2 + 0.5, y: SANDBOX_SIZE / 2 + 0.5 } as const

/** True where a road runs, so lots can be kept clear of them. */
function roadBand(v: number, size: number): boolean {
  const half = ROAD_WIDTH / 2
  for (let centre = size / 2; centre < size + BLOCK; centre += BLOCK) {
    if (Math.abs(v - centre) < half) return true
  }
  for (let centre = size / 2 - BLOCK; centre > -BLOCK; centre -= BLOCK) {
    if (Math.abs(v - centre) < half) return true
  }
  return false
}

function layStreets(grid: Grid, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const onRoad = roadBand(x, size) || roadBand(y, size)
      if (onRoad) {
        grid.set(x, y, Tile.Road)
        continue
      }

      const nearRoad =
        roadBand(x - PAVEMENT, size) ||
        roadBand(x + PAVEMENT, size) ||
        roadBand(y - PAVEMENT, size) ||
        roadBand(y + PAVEMENT, size)

      if (nearRoad) grid.set(x, y, Tile.Sidewalk)
    }
  }
}

export function createSandbox(seed: number = SANDBOX_SEED): Grid {
  const size = SANDBOX_SIZE
  const grid = createGrid(size, size, Tile.Grass)
  const rng = createRng(seed)

  layStreets(grid, size)

  let nextBuildingId = 1
  const inset = ROAD_WIDTH / 2 + PAVEMENT + 1

  for (let blockY = 0; blockY < size; blockY += BLOCK) {
    for (let blockX = 0; blockX < size; blockX += BLOCK) {
      const blockOriginX = blockX + inset
      const blockOriginY = blockY + inset
      const blockW = BLOCK - inset * 2
      const blockH = BLOCK - inset * 2

      if (blockOriginX + blockW >= size || blockOriginY + blockH >= size) continue

      const district = districtAt(blockOriginX + blockW / 2, blockOriginY + blockH / 2, size)

      // How finely a block is carved up is what sets the density of the area, and
      // density is most of what makes a district feel different on foot. Housing is
      // several small plots to a block; industry is one yard that takes the lot.
      const lots = lotsPerBlock(district)
      const lotW = Math.floor(blockW / lots)
      const lotH = Math.floor(blockH / lots)

      for (let ly = 0; ly < lots; ly++) {
        for (let lx = 0; lx < lots; lx++) {
          const lotX = blockOriginX + lx * lotW
          const lotY = blockOriginY + ly * lotH

          const candidates = archetypesFor(district)
          if (candidates.length === 0) continue

          const archetype = rng.pick(candidates)
          const { lotFill } = districtDef(district)

          // A gap between plots, so neighbouring buildings never share a wall.
          const maxW = Math.floor(lotW * lotFill) - 1
          const maxH = Math.floor(lotH * lotFill) - 1

          const w = Math.min(maxW, rng.int(archetype.minSize, archetype.maxSize))
          const h = Math.min(maxH, rng.int(archetype.minSize, archetype.maxSize))

          if (w < 5 || h < 5) continue

          // Sit the building somewhere in its plot rather than centred, so a street
          // does not read as a row of identically spaced boxes.
          const x = lotX + rng.int(0, Math.max(0, lotW - w - 1))
          const y = lotY + rng.int(0, Math.max(0, lotH - h - 1))

          // Leave the spawn point clear, so the character never starts in a wall.
          const coversSpawn =
            SPAWN.x >= x - 1 && SPAWN.x <= x + w + 1 && SPAWN.y >= y - 1 && SPAWN.y <= y + h + 1
          if (coversSpawn) continue

          placeBuilding(grid, archetype, { x, y, w, h }, nextBuildingId, rng)
          nextBuildingId += 1
        }
      }
    }
  }

  scatterVegetation(grid, rng)
  placeStreetLights(grid, rng)

  return grid
}

/**
 * Tiles between lamp posts along a pavement.
 *
 * Deliberately very sparse. Evenly lit streets read as a functioning town; long
 * dark stretches with a rare pool of light do not, and the gaps are doing more for
 * the atmosphere than the lamps are. Each lamp reaches further to compensate, so
 * the ones that survive feel like landmarks rather than street furniture.
 */
const LAMP_SPACING = 47

/**
 * How lamps have fared. Weighted heavily toward failure — a working street light
 * should feel like a small mercy rather than the default.
 */
const LAMP_STATES = [
  LampState.Broken,
  LampState.Broken,
  LampState.Broken,
  LampState.Broken,
  LampState.Flickering,
  LampState.Flickering,
  LampState.Working,
  LampState.Working,
] as const

/**
 * Puts lamp posts along the pavements at regular intervals.
 *
 * Regular on purpose — street lighting is one of the few things in a town that
 * genuinely is evenly spaced, and the regularity reads as municipal rather than
 * as an artefact. They go on the pavement edge furthest from the road so they do
 * not stand in the middle of the footway.
 */
function placeStreetLights(grid: Grid, rng: Rng): void {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.at(x, y) !== Tile.Sidewalk) continue
      if (grid.propAt(x, y) !== Prop.None) continue
      if ((x + y) % LAMP_SPACING !== 0) continue

      // Only on the outer edge of a pavement, where it meets something that is
      // not paved — otherwise they end up in the middle of a crossing.
      const beside =
        grid.at(x + 1, y) === Tile.Grass ||
        grid.at(x - 1, y) === Tile.Grass ||
        grid.at(x, y + 1) === Tile.Grass ||
        grid.at(x, y - 1) === Tile.Grass
      if (!beside) continue

      grid.setProp(x, y, Prop.LampPost, rng.pick(LAMP_STATES))
    }
  }
}

/**
 * Which species appear, and how often. Repeats weight the roll: dead trees come
 * up three times as often as anything still living, which is what gives the
 * woodland its character rather than any individual sprite.
 */
const CANOPY = [
  Prop.DeadTree,
  Prop.DeadTree,
  Prop.DeadTree,
  Prop.Pine,
  Prop.Willow,
  Prop.Tree,
] as const

const GROUND_COVER = [Prop.Sagebrush, Prop.Sagebrush, Prop.Scrub] as const

/**
 * Scatters trees and undergrowth over open ground.
 *
 * Clustered rather than evenly sprinkled. An even scatter reads as a texture — the
 * eye picks up the regularity immediately — whereas vegetation actually grows in
 * clumps with clearings between them. The clumping here is crude: a low-frequency
 * value noise decides how wooded each area is, and the per-tile roll is weighted by
 * it.
 *
 * Nothing is placed on roads, pavements or inside buildings, and a margin is left
 * around the pavement so trees do not crowd the doors.
 */
function scatterVegetation(grid: Grid, rng: Rng): void {
  // A coarse lattice of densities, smoothed between points, gives clumps far more
  // cheaply than any real noise function and is plenty for deciding where woodland
  // goes.
  const cell = 12
  const lattice: number[][] = []
  for (let y = 0; y <= Math.ceil(grid.height / cell); y++) {
    const row: number[] = []
    for (let x = 0; x <= Math.ceil(grid.width / cell); x++) row.push(rng.next())
    lattice.push(row)
  }

  const densityAt = (x: number, y: number): number => {
    const gx = x / cell
    const gy = y / cell
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = gx - x0
    const fy = gy - y0

    const at = (ax: number, ay: number): number => lattice[ay]?.[ax] ?? 0.5
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx
    return top * (1 - fy) + bottom * fy
  }

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.at(x, y) !== Tile.Grass) continue
      if (grid.buildingAt(x, y) !== 0) continue

      // Keep clear of anything paved, so trees do not block doorways or pavements.
      let nearPaved = false
      for (let dy = -1; dy <= 1 && !nearPaved; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const neighbour = grid.at(x + dx, y + dy)
          if (neighbour !== Tile.Grass) {
            nearPaved = true
            break
          }
        }
      }
      if (nearPaved) continue

      const density = densityAt(x, y)

      // Sparse, and weighted toward the bare and the half-dead. Standing timber
      // is the exception rather than the rule; low dry growth is what fills the
      // gaps between.
      if (rng.next() < density * 0.1) {
        grid.setProp(x, y, rng.pick(CANOPY), rng.int(0, PROP_VARIANTS - 1))
      } else if (rng.next() < density * 0.22) {
        grid.setProp(x, y, rng.pick(GROUND_COVER), rng.int(0, PROP_VARIANTS - 1))
      }
    }
  }
}

/** How many plots a block is divided into along each axis. */
function lotsPerBlock(district: DistrictId): number {
  switch (district) {
    case District.Residential:
      return 2
    case District.Commercial:
      return 2
    case District.Industrial:
      return 1
  }
}
