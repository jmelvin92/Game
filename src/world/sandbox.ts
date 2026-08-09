import { createRng } from '@/core/rng'
import { archetypesFor, placeBuilding } from '@/world/buildings'
import { District, districtAt, districtDef, type DistrictId } from '@/world/districts'
import { createGrid, type Grid } from '@/world/grid'
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

  return grid
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
