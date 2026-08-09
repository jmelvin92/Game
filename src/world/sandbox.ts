import { createRng, type Rng } from '@/core/rng'
import { archetypesFor, placeBuilding } from '@/world/buildings'
import { District, districtAt, districtDef, type DistrictId } from '@/world/districts'
import { createGrid, type Grid } from '@/world/grid'
import { LampCondition, Prop, PROP_VARIANTS } from '@/world/props'
import { Tile, type TileId } from '@/world/tiles'

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

/**
 * The map is taller than it is wide.
 *
 * The town sits in the southern half and open country runs north of it, so the
 * place has an edge — somewhere the streets stop and the map keeps going. A town
 * that fills its own map has no outside, and nowhere to be that is not a street.
 *
 * Size is set by how long it takes to walk, not by the numbers. At 3.4 tiles a
 * second this is a little over two minutes across the town and about five from the
 * northern edge to the southern one — where the previous 128x256 was thirty-eight
 * seconds and seventy-five, small enough to see all of in a single night.
 *
 * Sixteen times the area of that, and still only 8 MB: the world costs 16 bytes a
 * tile, so being large is nearly free. Streaming is a memory argument, and at this
 * size there is not one yet.
 */
export const SANDBOX_WIDTH = 512
export const SANDBOX_HEIGHT = 1024

/**
 * First row of the town. Everything north of this is country.
 *
 * Half and half, so the country is a place in its own right rather than a border.
 */
export const TOWN_TOP = 512

export const SANDBOX_SEED = 20260808

/** Roughly one field per this many tiles of countryside. */
const TILES_PER_FIELD = 630

/** Tiles between road centrelines. */
const BLOCK = 32
const ROAD_WIDTH = 4
const PAVEMENT = 2

const TOWN_CENTRE_X = SANDBOX_WIDTH / 2
const TOWN_CENTRE_Y = (TOWN_TOP + SANDBOX_HEIGHT) / 2

export const SPAWN = { x: TOWN_CENTRE_X + 0.5, y: TOWN_CENTRE_Y + 0.5 } as const

/**
 * True where a road runs, so lots can be kept clear of them.
 *
 * Modular rather than a search outward from the centre. The previous version swept
 * a fixed twelve blocks each way, which covered the old map by luck rather than by
 * design and would have quietly stopped laying roads part-way across a larger one —
 * exactly the sort of thing that looks like a generation bug and is really a
 * constant that stopped being big enough.
 */
function roadBand(v: number, centre: number): boolean {
  const offset = (((v - centre) % BLOCK) + BLOCK) % BLOCK
  return Math.min(offset, BLOCK - offset) < ROAD_WIDTH / 2
}

function layStreets(grid: Grid): void {
  for (let y = TOWN_TOP; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const onRoad = roadBand(x, TOWN_CENTRE_X) || roadBand(y, TOWN_CENTRE_Y)
      if (onRoad) {
        grid.set(x, y, Tile.Road)
        continue
      }

      const nearRoad =
        roadBand(x - PAVEMENT, TOWN_CENTRE_X) ||
        roadBand(x + PAVEMENT, TOWN_CENTRE_X) ||
        roadBand(y - PAVEMENT, TOWN_CENTRE_Y) ||
        roadBand(y + PAVEMENT, TOWN_CENTRE_Y)

      if (nearRoad) grid.set(x, y, Tile.Sidewalk)
    }
  }
}

/**
 * One road leaving town to the north.
 *
 * Without it the countryside is somewhere the map merely continues into. A road
 * running out of town and stopping at the horizon is a reason to walk that way, and
 * a line to find your way back along in the dark.
 *
 * No pavements: it stops being a street the moment it leaves the last house.
 */
function layHighway(grid: Grid, rng: Rng): void {
  // Follows one of the town's own north-south roads out, so it joins the grid
  // rather than appearing beside it.
  let x = TOWN_CENTRE_X

  for (let y = TOWN_TOP - 1; y >= 0; y--) {
    // Wanders very slightly, because a dead straight line for a hundred tiles
    // reads as a drawing rather than as a road.
    if (rng.chance(0.14)) x += rng.chance(0.5) ? 1 : -1
    x = Math.max(6, Math.min(grid.width - 7, x))

    for (let w = -ROAD_WIDTH / 2; w < ROAD_WIDTH / 2; w++) {
      grid.set(Math.round(x + w), y, Tile.Road)
    }
  }
}

export function createSandbox(seed: number = SANDBOX_SEED): Grid {
  const grid = createGrid(SANDBOX_WIDTH, SANDBOX_HEIGHT, Tile.Grass)
  const rng = createRng(seed)

  layStreets(grid)
  layHighway(grid, rng)
  layFields(grid, rng)

  let nextBuildingId = 1
  const inset = ROAD_WIDTH / 2 + PAVEMENT + 1

  for (let blockY = TOWN_TOP; blockY < grid.height; blockY += BLOCK) {
    for (let blockX = 0; blockX < grid.width; blockX += BLOCK) {
      const blockOriginX = blockX + inset
      const blockOriginY = blockY + inset
      const blockW = BLOCK - inset * 2
      const blockH = BLOCK - inset * 2

      if (blockOriginX + blockW >= grid.width || blockOriginY + blockH >= grid.height) continue

      const district = districtAt(
        blockOriginX + blockW / 2,
        blockOriginY + blockH / 2,
        grid.width,
        TOWN_TOP,
        TOWN_CENTRE_X,
        TOWN_CENTRE_Y,
      )

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
 * What condition the lamps are in. None of them are lit — the grid is dead — so
 * this only decides what the player can do with one: an intact lamp takes a charge
 * cleanly, a damaged one stutters while it burns, a broken one needs repairing
 * before it will take anything at all.
 */
const LAMP_CONDITIONS = [
  LampCondition.Broken,
  LampCondition.Broken,
  LampCondition.Broken,
  LampCondition.Damaged,
  LampCondition.Damaged,
  LampCondition.Intact,
  LampCondition.Intact,
  LampCondition.Intact,
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
  // Town only. A lamp post standing in a field is not eerie, it is a mistake.
  for (let y = TOWN_TOP; y < grid.height; y++) {
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

      grid.setProp(x, y, Prop.LampPost, rng.pick(LAMP_CONDITIONS))
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
      const here = grid.at(x, y)
      if (!growsOn(here)) continue
      if (grid.buildingAt(x, y) !== 0) continue

      // Keep clear of paving, so trees do not block doorways or pavements. Only
      // paving: a field boundary is not a reason for nothing to grow beside it,
      // and treating it as one leaves a bald margin around every field.
      let nearPaved = false
      for (let dy = -1; dy <= 1 && !nearPaved; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (isPaved(grid.at(x + dx, y + dy))) {
            nearPaved = true
            break
          }
        }
      }
      if (nearPaved) continue

      let density = densityAt(x, y)

      // Thicker out in the country. In town the gaps between trees are streets and
      // buildings; with those gone, the same sparse scatter reads as an empty field
      // rather than as land nobody has cut back in years.
      if (y < TOWN_TOP) density *= 2.1

      // Worked ground carries scrub at best — a field that has gone to seed, not
      // woodland. It is also what keeps the fields legible as fields.
      const wooded = here === Tile.Grass

      // Sparse, and weighted toward the bare and the half-dead. Standing timber
      // is the exception rather than the rule; low dry growth is what fills the
      // gaps between.
      if (wooded && rng.next() < density * 0.1) {
        grid.setProp(x, y, rng.pick(CANOPY), rng.int(0, PROP_VARIANTS - 1))
      } else if (rng.next() < density * (wooded ? 0.22 : 0.1)) {
        grid.setProp(x, y, rng.pick(GROUND_COVER), rng.int(0, PROP_VARIANTS - 1))
      }
    }
  }
}

/** Ground that will carry a plant. */
function growsOn(tile: TileId): boolean {
  return tile === Tile.Grass || tile === Tile.Dirt || tile === Tile.Rock
}

/** Ground somebody laid, as opposed to ground that was already there. */
function isPaved(tile: TileId): boolean {
  return tile === Tile.Road || tile === Tile.Sidewalk
}

/** How many plots a block is divided into along each axis. */
function lotsPerBlock(district: DistrictId): number {
  switch (district) {
    case District.Residential:
    case District.Commercial:
      return 2
    case District.Industrial:
      return 1
    case District.Countryside:
      // Nothing is built out here, so no plots are wanted.
      return 0
  }
}

/**
 * Lays fields across the countryside.
 *
 * Large, irregular patches of dry ground and worked earth. They matter less as
 * scenery than as landmarks: an unbroken expanse of the same grass gives nothing to
 * navigate by, and a country with no features is a country you get lost in rather
 * than one you cross.
 *
 * Kept off the road, so the way back to town stays legible.
 */
function layFields(grid: Grid, rng: Rng): void {
  // Scaled to the area rather than a fixed count, or enlarging the map quietly
  // thins the country out until it is bare grass again.
  const fields = Math.round((grid.width * TOWN_TOP) / TILES_PER_FIELD)

  for (let i = 0; i < fields; i++) {
    const w = rng.int(14, 30)
    const h = rng.int(10, 22)
    const x = rng.int(2, Math.max(3, grid.width - w - 2))
    const y = rng.int(2, Math.max(3, TOWN_TOP - h - 2))

    const surface = rng.pick([Tile.Dirt, Tile.Dirt, Tile.Dirt, Tile.Rock] as const)

    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (grid.at(tx, ty) === Tile.Road) continue

        // Ragged edges. A field with straight sides reads as a placed rectangle,
        // which is exactly what it is and exactly what it should not look like.
        const edgeX = Math.min(tx - x, x + w - 1 - tx)
        const edgeY = Math.min(ty - y, y + h - 1 - ty)
        if (Math.min(edgeX, edgeY) < 2 && rng.chance(0.55)) continue

        grid.set(tx, ty, surface)
      }
    }
  }
}
