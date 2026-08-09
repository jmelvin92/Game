import { hash2d } from '@/core/noise'
import { createRng, type Rng } from '@/core/rng'
import { WallStyle } from '@/world/buildings'
import { Biome, biomeAt } from '@/world/biomes'
import { createGrid, type Grid } from '@/world/grid'
import { buildHouse } from '@/world/house'
import { LampCondition, Prop, PROP_VARIANTS } from '@/world/props'
import { Tile, type TileId } from '@/world/tiles'
import { Wall, WallSide } from '@/world/walls'

/**
 * Generates the island.
 *
 * The order is the logic: nature first, then the things people cut into it.
 * Biomes paint the ground; settlements carve street grids out of it; highways
 * join the settlements; farms and airfields sit along the way; and only then is
 * the world dressed — vegetation where nothing was built, lamps where pavement
 * was laid, wrecks where the roads run.
 *
 * Seeded throughout, so the same seed always produces the same island. Without
 * that, a layout bug seen once could never be looked at again.
 */

/**
 * Size is set by how long it takes to walk. At 3.4 tiles a second the island is
 * about five minutes coast to coast, and the sea claims roughly half of that
 * square — the map has no edge you can reach, only a shore.
 */
export const SANDBOX_WIDTH = 1024
export const SANDBOX_HEIGHT = 1024

export const SANDBOX_SEED = 20260808

/**
 * Where people settled, in map fractions.
 *
 * Chosen against the biome map at the default seed — all of them sit on
 * grassland, which is where towns get built — and validated by the generation
 * test, so a future change to the noise that drowns a town fails loudly rather
 * than shipping a city under water.
 */
const CITY = { x: 512, y: 614, w: 264, h: 224, block: 36, pavement: 2 } as const
const TOWN = { x: 430, y: 300, w: 90, h: 78, block: 30, pavement: 1 } as const

/** Airfields: one serving the city, one rural strip in the north. */
const AIRPORT_CITY = { x: 700, y: 680, alongX: true } as const
const AIRPORT_RURAL = { x: 300, y: 212, alongX: false } as const

const RUNWAY_LENGTH = 86
const RUNWAY_WIDTH = 7

/**
 * Where the house stands: the block north-east of the city's central
 * crossroads, facing the southern street. The city's grid is still here —
 * streets, pavements, lamps — but its buildings are gone: this one house is
 * being built by hand first, and the generator will be rebuilt to its standard
 * once it is right.
 */
export const HOUSE_AT = { x: 524, y: 632 } as const

/** On the front path, facing the door. */
export const SPAWN = { x: HOUSE_AT.x + 8.5, y: HOUSE_AT.y + 11.5 } as const

interface Settlement {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly block: number
  readonly pavement: number
}

/** Arterial roads run every third band; the rest are residential streets. */
const ARTERIAL_EVERY = 3
const ARTERIAL_WIDTH = 5
const STREET_WIDTH = 3

/**
 * Road width at a coordinate relative to a settlement's grid, or 0 off-road.
 *
 * Modular arithmetic rather than a search, so it holds at any size. Wide roads
 * every few blocks with narrow streets between is most of what makes a district
 * feel like a place with through-routes rather than a uniform lattice.
 */
function roadHalfWidth(v: number, centre: number, block: number): number {
  const band = Math.round((v - centre) / block)
  const offset = Math.abs(v - centre - band * block)
  const width = band % ARTERIAL_EVERY === 0 ? ARTERIAL_WIDTH : STREET_WIDTH
  return offset < width / 2 ? width / 2 : 0
}

/** Streets and pavements for one settlement, carved into whatever ground is there. */
function layStreets(grid: Grid, s: Settlement): void {
  for (let y = s.y - s.h / 2; y <= s.y + s.h / 2; y++) {
    for (let x = s.x - s.w / 2; x <= s.x + s.w / 2; x++) {
      if (grid.at(x, y) === Tile.Water) continue

      const onX = roadHalfWidth(x, s.x, s.block)
      const onY = roadHalfWidth(y, s.y, s.block)
      if (onX > 0 || onY > 0) {
        grid.set(x, y, Tile.Road)
        continue
      }

      // Pavement hugs the road: within `pavement` tiles of a road band's edge.
      const nearX =
        roadHalfWidth(x - s.pavement, s.x, s.block) > 0 ||
        roadHalfWidth(x + s.pavement, s.x, s.block) > 0
      const nearY =
        roadHalfWidth(y - s.pavement, s.y, s.block) > 0 ||
        roadHalfWidth(y + s.pavement, s.y, s.block) > 0
      if (nearX || nearY) grid.set(x, y, Tile.Sidewalk)
    }
  }
}

/**
 * A country road between two points: one wandering leg per axis.
 *
 * The wander is why it is drawn as a walk rather than two rectangles — a dead
 * straight line for three hundred tiles reads as a ruler, not a road.
 */
function layRoad(
  grid: Grid,
  rng: Rng,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  const paint = (cx: number, cy: number): void => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (grid.at(cx + dx, cy + dy) === Tile.Water) continue
        grid.set(cx + dx, cy + dy, Tile.Road)
      }
    }
  }

  let x = from.x
  let y = from.y
  const stepX = Math.sign(to.x - x)
  const stepY = Math.sign(to.y - y)

  while (x !== to.x) {
    x += stepX
    if (rng.chance(0.1)) y += rng.chance(0.5) ? 1 : -1
    paint(x, y)
  }
  while (y !== to.y) {
    y += stepY
    if (rng.chance(0.1) && Math.abs(x - to.x) > 2) x += rng.chance(0.5) ? 1 : -1
    paint(x, y)
  }
}

/** Ground that will carry a plant. */
function growsOn(tile: TileId): boolean {
  return tile === Tile.Grass || tile === Tile.Dirt || tile === Tile.Rock || tile === Tile.Sand
}

/** Ground somebody laid, as opposed to ground that was already there. */
function isPaved(tile: TileId): boolean {
  return tile === Tile.Road || tile === Tile.Sidewalk || tile === Tile.Concrete
}

export function createSandbox(seed: number = SANDBOX_SEED): Grid {
  const grid = createGrid(SANDBOX_WIDTH, SANDBOX_HEIGHT, Tile.Grass)
  const rng = createRng(seed)

  paintBiomes(grid, seed)

  // Roads before buildings, so lots are laid out against real streets; the
  // country roads before the settlements' own grids so junctions form in town.
  layRoad(grid, rng, { x: CITY.x, y: CITY.y }, { x: TOWN.x, y: TOWN.y })
  layRoad(grid, rng, { x: CITY.x, y: CITY.y }, { x: AIRPORT_CITY.x - 20, y: AIRPORT_CITY.y })
  layRoad(grid, rng, { x: TOWN.x, y: TOWN.y }, { x: AIRPORT_RURAL.x, y: AIRPORT_RURAL.y + 30 })

  layStreets(grid, CITY)
  layStreets(grid, TOWN)

  layAirport(grid, rng, AIRPORT_CITY.x, AIRPORT_CITY.y, AIRPORT_CITY.alongX)
  layAirport(grid, rng, AIRPORT_RURAL.x, AIRPORT_RURAL.y, AIRPORT_RURAL.alongX)

  layFarms(grid, rng)

  buildHouse(grid, HOUSE_AT.x, HOUSE_AT.y, 1)

  scatterVegetation(grid, seed, rng)
  placeStreetLights(grid, rng)
  scatterWrecks(grid, seed)

  return grid
}

/** The ground, straight off the biome map. Desert is a sand-and-rock mix. */
function paintBiomes(grid: Grid, seed: number): void {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      switch (biomeAt(x, y, grid.width, grid.height, seed)) {
        case Biome.Ocean:
          grid.set(x, y, Tile.Water)
          break
        case Biome.Beach:
          grid.set(x, y, Tile.Sand)
          break
        case Biome.Desert:
          grid.set(x, y, hash2d(x, y, seed + 31) < 0.82 ? Tile.Sand : Tile.Rock)
          break
        case Biome.Grassland:
        case Biome.Forest:
          grid.set(x, y, Tile.Grass)
          break
      }
    }
  }
}

/** A two-tile gate in the middle of a fence run. */
function isGate(i: number, length: number): boolean {
  return Math.abs(i - length / 2) <= 1
}

/**
 * An airfield: runway, apron, hangars, a windsock, and a perimeter fence.
 *
 * Nothing here flies. The runways are for later — long-distance travel is on the
 * roadmap — but an island with airfields on it *promises* that later, which is
 * exactly what a landmark is for.
 */
function layAirport(grid: Grid, rng: Rng, cx: number, cy: number, alongX: boolean): void {
  const halfL = RUNWAY_LENGTH / 2
  const halfW = Math.floor(RUNWAY_WIDTH / 2)

  // The field: everything inside the fence is kept ground, mown once, long ago.
  const fieldW = alongX ? halfL + 14 : 30
  const fieldH = alongX ? 30 : halfL + 14
  for (let y = cy - fieldH; y <= cy + fieldH; y++) {
    for (let x = cx - fieldW; x <= cx + fieldW; x++) {
      if (grid.at(x, y) !== Tile.Water) grid.set(x, y, Tile.Grass)
    }
  }

  // Runway.
  for (let along = -halfL; along <= halfL; along++) {
    for (let across = -halfW; across <= halfW; across++) {
      const x = cx + (alongX ? along : across)
      const y = cy + (alongX ? across : along)
      grid.set(x, y, Tile.Concrete)
    }
  }

  // Apron beside the runway's midpoint, with the buildings off its far edge.
  const apronX = cx + (alongX ? -10 : 12)
  const apronY = cy + (alongX ? 12 : -10)
  for (let y = apronY - 9; y <= apronY + 9; y++) {
    for (let x = apronX - 11; x <= apronX + 11; x++) {
      grid.set(x, y, Tile.Concrete)
    }
  }

  // No hangars, no office: the airfield keeps its ground works only while
  // buildings are being rebuilt by hand, starting from the house.

  // Windsock at the runway's end, where a pilot would look for it.
  const sockX = cx + (alongX ? halfL - 2 : halfW + 3)
  const sockY = cy + (alongX ? halfW + 3 : halfL - 2)
  grid.setProp(sockX, sockY, Prop.Windsock, rng.int(0, PROP_VARIANTS - 1))

  // Apron lighting: airfields are the best-lit places on the island, if anyone
  // can afford to light them.
  for (const [lx, ly] of [
    [apronX - 11, apronY - 9],
    [apronX + 11, apronY - 9],
    [apronX - 11, apronY + 9],
    [apronX + 11, apronY + 9],
  ] as const) {
    if (grid.propAt(lx, ly) === Prop.None) {
      grid.setProp(lx, ly, Prop.LampPost, rng.pick(LAMP_CONDITIONS))
    }
  }
}

/**
 * Farms along the road between the city and the town: a fenced field of worked
 * earth with a farmhouse and barn in a yard at one end.
 */
function layFarms(grid: Grid, rng: Rng): void {
  const estates = 5

  for (let i = 0; i < estates; i++) {
    // Spread along the corridor, offset to alternate sides of the road. The road
    // wanders, so each estate tries a few distances out before giving up — the
    // first cut of this only demanded one spot per farm, and three of the five
    // farms fell on a bend of the road and were silently skipped.
    const t = (i + 1) / (estates + 1)
    const cy = Math.round(CITY.y + (TOWN.y - CITY.y) * t)

    const fieldW = rng.int(22, 30)
    const fieldH = rng.int(16, 22)

    let cx = 0
    let clear = false
    for (const distance of [26, 40, 54, -46, -62]) {
      cx = Math.round(CITY.x + (TOWN.x - CITY.x) * t) + (i % 2 === 0 ? distance : -distance)

      clear = true
      for (let y = cy; y < cy + fieldH + 16 && clear; y++) {
        for (let x = cx; x < cx + fieldW && clear; x++) {
          if (grid.at(x, y) !== Tile.Grass || grid.buildingAt(x, y) !== 0) clear = false
        }
      }
      if (clear) break
    }
    if (!clear) continue

    // The field.
    for (let y = cy; y < cy + fieldH; y++) {
      for (let x = cx; x < cx + fieldW; x++) {
        grid.set(x, y, Tile.Soil)
      }
    }

    // Fence it, gate in the middle of the south side, facing the yard.
    for (let x = cx; x < cx + fieldW; x++) {
      grid.setWall(x, cy, WallSide.North, Wall.Solid, WallStyle.Fence, 1)
      if (!isGate(x - cx, fieldW))
        grid.setWall(x, cy + fieldH, WallSide.North, Wall.Solid, WallStyle.Fence, 1)
    }
    for (let y = cy; y < cy + fieldH; y++) {
      grid.setWall(cx, y, WallSide.West, Wall.Solid, WallStyle.Fence, 1)
      grid.setWall(cx + fieldW, y, WallSide.West, Wall.Solid, WallStyle.Fence, 1)
    }

    // No farmhouse, no barn: the fields keep the land worked-looking while
    // buildings are rebuilt by hand, starting from the house.
  }
}

/**
 * Tiles between lamp posts along a pavement.
 *
 * Deliberately very sparse. Evenly lit streets read as a functioning town; long
 * dark stretches with a rare pool of light do not, and the gaps are doing more for
 * the atmosphere than the lamps are.
 */
const LAMP_SPACING = 47

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

/** Lamp posts along the pavements, on the edge away from the road. */
function placeStreetLights(grid: Grid, rng: Rng): void {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.at(x, y) !== Tile.Sidewalk) continue
      if (grid.propAt(x, y) !== Prop.None) continue
      if ((x + y) % LAMP_SPACING !== 0) continue

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
 * Dead cars along the roads.
 *
 * Hash-scattered rather than drawn from the RNG sequence so the density is
 * uniform per road tile however the roads were laid. Orientation follows the
 * road: a wreck across the carriageway would say "barricade", and nobody has
 * built one of those here yet.
 */
function scatterWrecks(grid: Grid, seed: number): void {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.at(x, y) !== Tile.Road) continue
      if (grid.propAt(x, y) !== Prop.None) continue
      if (hash2d(x, y, seed + 97) > 0.004) continue

      const eastWest =
        (grid.at(x + 1, y) === Tile.Road ? 1 : 0) + (grid.at(x - 1, y) === Tile.Road ? 1 : 0) >=
        (grid.at(x, y + 1) === Tile.Road ? 1 : 0) + (grid.at(x, y - 1) === Tile.Road ? 1 : 0)

      // Variants encode orientation in their parity; see the painter.
      const paint = Math.floor(hash2d(x, y, seed + 98) * 3)
      grid.setProp(x, y, Prop.CarWreck, eastWest ? paint * 2 : paint * 2 + 1)
    }
  }
}

/** Species by biome. Forests get the full canopy; desert gets what survives there. */
const FOREST_CANOPY = [
  Prop.DeadTree,
  Prop.DeadTree,
  Prop.Pine,
  Prop.Pine,
  Prop.Willow,
  Prop.Tree,
] as const

const GRASSLAND_CANOPY = [
  Prop.DeadTree,
  Prop.DeadTree,
  Prop.DeadTree,
  Prop.Willow,
  Prop.Tree,
] as const

const GROUND_COVER = [Prop.Sagebrush, Prop.Sagebrush, Prop.Scrub] as const

/**
 * Vegetation, by biome.
 *
 * Density is position-hashed noise rather than the RNG sequence, so it stays
 * uniform however generation before it changed. Forest is woodland with clumps
 * and clearings; grassland is scattered trees; desert is brush and boulders;
 * beaches are almost bare.
 */
function scatterVegetation(grid: Grid, seed: number, rng: Rng): void {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const here = grid.at(x, y)
      if (!growsOn(here)) continue
      if (grid.buildingAt(x, y) !== 0) continue
      if (grid.propAt(x, y) !== Prop.None) continue

      // Nothing grows against paving — trees do not block doorways or pavements.
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

      const biome = biomeAt(x, y, grid.width, grid.height, seed)
      const roll = hash2d(x, y, seed + 71)

      if (biome === Biome.Forest) {
        // Clumped: low-frequency noise decides how thick the woodland is here.
        const density = 0.35 + hash2d(Math.floor(x / 14), Math.floor(y / 14), seed + 72) * 0.6
        if (roll < 0.2 * density) {
          grid.setProp(x, y, rng.pick(FOREST_CANOPY), rng.int(0, PROP_VARIANTS - 1))
        } else if (roll < 0.3 * density) {
          grid.setProp(x, y, rng.pick(GROUND_COVER), rng.int(0, PROP_VARIANTS - 1))
        }
      } else if (biome === Biome.Grassland && here === Tile.Grass) {
        if (roll < 0.015) {
          grid.setProp(x, y, rng.pick(GRASSLAND_CANOPY), rng.int(0, PROP_VARIANTS - 1))
        } else if (roll < 0.06) {
          grid.setProp(x, y, rng.pick(GROUND_COVER), rng.int(0, PROP_VARIANTS - 1))
        }
      } else if (biome === Biome.Desert) {
        if (roll < 0.008) {
          grid.setProp(x, y, Prop.Boulder, rng.int(0, PROP_VARIANTS - 1))
        } else if (roll < 0.045) {
          grid.setProp(x, y, rng.pick(GROUND_COVER), rng.int(0, PROP_VARIANTS - 1))
        } else if (roll < 0.048) {
          grid.setProp(x, y, Prop.DeadTree, rng.int(0, PROP_VARIANTS - 1))
        }
      } else if (biome === Biome.Beach) {
        if (roll < 0.012) {
          grid.setProp(x, y, Prop.Scrub, rng.int(0, PROP_VARIANTS - 1))
        }
      }
    }
  }
}
