import { hash2d } from '@/core/noise'
import { createRng, type Rng } from '@/core/rng'
import { archetypeNamed, archetypesFor, placeBuilding, WallStyle } from '@/world/buildings'
import { Biome, biomeAt } from '@/world/biomes'
import { District, districtDef, type DistrictId } from '@/world/districts'
import { createGrid, type Grid } from '@/world/grid'
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

/** The city's central crossroads. Roads are walkable, and a crossroads at dusk
    is the right opening shot for a game about which lights you dare turn on. */
export const SPAWN = { x: CITY.x + 4.5, y: CITY.y + 4.5 } as const

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

/** Which district a city block belongs to, by where it sits in the city. */
function cityDistrict(s: Settlement, blockX: number, blockY: number): DistrictId {
  const dx = blockX - s.x
  const dy = blockY - s.y

  // Downtown is the middle: towers and shops around the central crossroads.
  if (Math.max(Math.abs(dx), Math.abs(dy)) < s.block * 1.6) return District.Commercial

  // Industry keeps to the south-east corner, downwind and down-coast.
  if (dx > s.w * 0.22 && dy > s.h * 0.18) return District.Industrial

  // The trailer park is the western edge of town.
  if (dx < -s.w * 0.34) return District.TrailerPark

  return District.Residential
}

/**
 * How many plots a block is divided into along each axis.
 *
 * Derived from the room the block actually has rather than fixed per district —
 * a fixed count on a small block once shrank every house in the city to a 3x3
 * box, which is a shed. The target is the plot size a district wants; the block
 * gets as many of those as fit.
 */
function lotsPerBlock(district: DistrictId, inner: number): number {
  switch (district) {
    case District.Residential:
    case District.Commercial:
      return Math.max(1, Math.floor(inner / 10))
    case District.Industrial:
      return 1
    case District.TrailerPark:
      return Math.max(2, Math.floor(inner / 7))
    case District.Countryside:
      return 0
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

  let nextBuildingId = 1
  const id = (): number => nextBuildingId++

  nextBuildingId = buildSettlement(grid, rng, CITY, nextBuildingId, true)
  nextBuildingId = buildSettlement(grid, rng, TOWN, nextBuildingId, false)

  layAirport(grid, rng, AIRPORT_CITY.x, AIRPORT_CITY.y, AIRPORT_CITY.alongX, id)
  layAirport(grid, rng, AIRPORT_RURAL.x, AIRPORT_RURAL.y, AIRPORT_RURAL.alongX, id)

  layFarms(grid, rng, id)

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

/**
 * Fills a settlement's blocks with buildings.
 *
 * @param city whether the full district palette applies; the small town is all
 *   residential with a shop or two, because villages do not have downtowns
 */
function buildSettlement(
  grid: Grid,
  rng: Rng,
  s: Settlement,
  firstId: number,
  city: boolean,
): number {
  let nextId = firstId
  const inset = Math.ceil(ARTERIAL_WIDTH / 2) + s.pavement + 1

  for (let blockY = s.y - s.h / 2; blockY < s.y + s.h / 2; blockY += s.block) {
    for (let blockX = s.x - s.w / 2; blockX < s.x + s.w / 2; blockX += s.block) {
      const district = city
        ? cityDistrict(s, blockX + s.block / 2, blockY + s.block / 2)
        : rng.chance(0.12)
          ? District.Commercial
          : District.Residential

      const originX = blockX + inset
      const originY = blockY + inset
      const innerW = s.block - inset * 2
      const innerH = s.block - inset * 2
      if (innerW < 4 || innerH < 4) continue

      const lots = lotsPerBlock(district, innerW)
      if (lots === 0) continue

      const lotW = Math.floor(innerW / lots)
      const lotH = Math.floor(innerH / lots)

      for (let ly = 0; ly < lots; ly++) {
        for (let lx = 0; lx < lots; lx++) {
          const placed = placeLot(
            grid,
            rng,
            s,
            district,
            { x: originX + lx * lotW, y: originY + ly * lotH, w: lotW, h: lotH },
            nextId,
          )
          if (placed) nextId++
        }
      }
    }
  }

  return nextId
}

interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** One building on one plot. Returns whether anything was actually placed. */
function placeLot(
  grid: Grid,
  rng: Rng,
  s: Settlement,
  district: DistrictId,
  lot: Rect,
  buildingId: number,
): boolean {
  const candidates = archetypesFor(district)
  if (candidates.length === 0) return false

  const archetype =
    district === District.Commercial && Math.hypot(lot.x - s.x, lot.y - s.y) > s.block * 2.2
      ? // The edge of downtown steps down: shops and apartments, not towers.
        rng.pick(candidates.filter((a) => a.storeys < 6))
      : rng.pick(candidates)

  const { lotFill } = districtDef(district)
  let w = Math.min(Math.floor(lot.w * lotFill) - 1, rng.int(archetype.minSize, archetype.maxSize))
  let h = Math.min(Math.floor(lot.h * lotFill) - 1, rng.int(archetype.minSize, archetype.maxSize))

  // Trailers are oblong by definition; min/max sizes cannot express that.
  if (archetype.name === 'trailer') {
    const along = rng.chance(0.5)
    w = along ? rng.int(6, Math.max(6, lot.w - 2)) : rng.int(3, 4)
    h = along ? rng.int(3, 4) : rng.int(6, Math.max(6, lot.h - 2))
    w = Math.min(w, lot.w - 1)
    h = Math.min(h, lot.h - 1)
  }

  if (w < 3 || h < 3) return false

  // A country road cutting the corner of a lot should cost that corner, not the
  // building: try a few spots in the lot before conceding it.
  for (let attempt = 0; attempt < 4; attempt++) {
    const x = lot.x + rng.int(0, Math.max(0, lot.w - w - 1))
    const y = lot.y + rng.int(0, Math.max(0, lot.h - h - 1))

    // Water and roads refuse a building, and so does any existing wall — a
    // footprint that satisfies the ground checks can still be inside somebody's
    // fenced yard, and building there entombs the fence. The spawn point stays
    // clear too.
    let blocked = false
    for (let ty = y - 1; ty <= y + h && !blocked; ty++) {
      for (let tx = x - 1; tx <= x + w; tx++) {
        const ground = grid.at(tx, ty)
        if (ground === Tile.Water || ground === Tile.Road) {
          blocked = true
          break
        }
        if (
          grid.wallAt(tx, ty, WallSide.North) !== Wall.None ||
          grid.wallAt(tx, ty, WallSide.West) !== Wall.None
        ) {
          blocked = true
          break
        }
      }
    }
    if (SPAWN.x >= x - 1 && SPAWN.x <= x + w + 1 && SPAWN.y >= y - 1 && SPAWN.y <= y + h + 1)
      blocked = true
    if (blocked) continue

    placeBuilding(grid, archetype, { x, y, w, h }, buildingId, rng, s)
    dressHouse(grid, rng, archetype.name, { x, y, w, h }, s)
    return true
  }

  return false
}

/**
 * The details that make a house a home somebody left: a garage on the lot, a
 * condenser against the wall, a fenced yard.
 */
function dressHouse(grid: Grid, rng: Rng, name: string, b: Rect, s: Settlement): void {
  const domestic = name === 'house' || name === 'bungalow'
  if (!domestic) return

  // Air conditioner against a side wall, on the outside.
  if (rng.chance(0.55)) {
    const east = rng.chance(0.5)
    const ax = east ? b.x + b.w : b.x - 1
    const ay = b.y + rng.int(1, Math.max(1, b.h - 2))
    if (grid.at(ax, ay) === Tile.Grass && grid.propAt(ax, ay) === Prop.None) {
      grid.setProp(ax, ay, Prop.AirConditioner, rng.int(0, PROP_VARIANTS - 1))
    }
  }

  // A fenced yard: the fence runs a tile out from the walls, with a gap on the
  // side facing the settlement centre so the door is never sealed in.
  if (rng.chance(0.3)) {
    const fx = b.x - 2
    const fy = b.y - 2
    const fw = b.w + 4
    const fh = b.h + 4
    const gateSide =
      Math.abs(b.x + b.w / 2 - s.x) > Math.abs(b.y + b.h / 2 - s.y)
        ? b.x + b.w / 2 > s.x
          ? 'west'
          : 'east'
        : b.y + b.h / 2 > s.y
          ? 'north'
          : 'south'

    // Refuse the yard unless everywhere the fence would stand — and a one-tile
    // margin beyond it — is free of walls. This is deliberately blunt. Checking
    // only the fence's own line let two neighbouring yards interleave, each
    // passing through the other's gate gap, and together they enclosed ground
    // that sealed a house with its door and its gate both open. Fences that can
    // never touch anything cannot conspire; the cost is that cramped lots go
    // unfenced, which is what cramped lots look like anyway.
    for (let my = fy - 1; my <= fy + fh + 1; my++) {
      for (let mx = fx - 1; mx <= fx + fw + 1; mx++) {
        // The strict interior holds the house's own walls, which are welcome;
        // everything on or beyond the ring must be bare.
        const interior = mx > fx && mx < fx + fw && my > fy && my < fy + fh
        if (interior) continue
        if (grid.wallAt(mx, my, WallSide.North) !== Wall.None) return
        if (grid.wallAt(mx, my, WallSide.West) !== Wall.None) return
      }
    }

    for (let i = 0; i < fw; i++) {
      const gx = fx + i
      if (clearForFence(grid, gx, fy) && !(gateSide === 'north' && isGate(i, fw)))
        grid.setWall(gx, fy, WallSide.North, Wall.Solid, WallStyle.Fence, 1)
      if (clearForFence(grid, gx, fy + fh - 1) && !(gateSide === 'south' && isGate(i, fw)))
        grid.setWall(gx, fy + fh, WallSide.North, Wall.Solid, WallStyle.Fence, 1)
    }
    for (let i = 0; i < fh; i++) {
      const gy = fy + i
      if (clearForFence(grid, fx, gy) && !(gateSide === 'west' && isGate(i, fh)))
        grid.setWall(fx, gy, WallSide.West, Wall.Solid, WallStyle.Fence, 1)
      if (clearForFence(grid, fx + fw - 1, gy) && !(gateSide === 'east' && isGate(i, fh)))
        grid.setWall(fx + fw, gy, WallSide.West, Wall.Solid, WallStyle.Fence, 1)
    }
  }
}

/** A two-tile gate in the middle of a fence run. */
function isGate(i: number, length: number): boolean {
  return Math.abs(i - length / 2) <= 1
}

/** Fences stop at pavement and never cross another building's ground. */
function clearForFence(grid: Grid, x: number, y: number): boolean {
  return grid.at(x, y) === Tile.Grass && grid.buildingAt(x, y) === 0
}

/**
 * An airfield: runway, apron, hangars, a windsock, and a perimeter fence.
 *
 * Nothing here flies. The runways are for later — long-distance travel is on the
 * roadmap — but an island with airfields on it *promises* that later, which is
 * exactly what a landmark is for.
 */
function layAirport(
  grid: Grid,
  rng: Rng,
  cx: number,
  cy: number,
  alongX: boolean,
  nextId: () => number,
): void {
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

  const hangar = archetypeNamed('hangar')
  const office = archetypeNamed('depot')
  const towards = { x: apronX, y: apronY }

  placeBuilding(grid, hangar, hangarSpot(apronX, apronY, alongX, 0), nextId(), rng, towards)
  placeBuilding(grid, hangar, hangarSpot(apronX, apronY, alongX, 1), nextId(), rng, towards)
  // Kept clear of both hangars and the runway — the first cut put it two tiles
  // into a hangar's footprint, and two buildings stamped over each other wall
  // their overlap into somewhere no door reaches.
  placeBuilding(
    grid,
    office,
    alongX
      ? { x: apronX + 13, y: apronY - 8, w: 10, h: 8 }
      : { x: apronX - 8, y: apronY + 13, w: 10, h: 8 },
    nextId(),
    rng,
    { x: apronX, y: apronY },
  )

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

/** Where a hangar stands relative to the apron: side by side along its back. */
function hangarSpot(apronX: number, apronY: number, alongX: boolean, slot: number): Rect {
  return alongX
    ? { x: apronX - 10 + slot * 16, y: apronY + 11, w: 14, h: 10 }
    : { x: apronX + 11, y: apronY - 10 + slot * 16, w: 10, h: 14 }
}

/**
 * Farms along the road between the city and the town: a fenced field of worked
 * earth with a farmhouse and barn in a yard at one end.
 */
function layFarms(grid: Grid, rng: Rng, nextId: () => number): void {
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

    // The yard below the field: house and barn, doors towards each other.
    const yardY = cy + fieldH + 3
    const towards = { x: cx + fieldW / 2, y: yardY + 5 }
    placeBuilding(
      grid,
      archetypeNamed('farmhouse'),
      { x: cx + 1, y: yardY, w: rng.int(7, 9), h: rng.int(7, 9) },
      nextId(),
      rng,
      towards,
    )
    placeBuilding(
      grid,
      archetypeNamed('barn'),
      { x: cx + fieldW - 12, y: yardY, w: 11, h: rng.int(9, 12) },
      nextId(),
      rng,
      towards,
    )
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
