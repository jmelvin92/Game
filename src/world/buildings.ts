import type { Rng } from '@/core/rng'
import { District, type DistrictId } from '@/world/districts'
import type { Grid } from '@/world/grid'
import { Tile, type TileId } from '@/world/tiles'
import { SEGMENTS_PER_STOREY, Wall, WallSide } from '@/world/walls'

/**
 * Building archetypes and how one gets stamped onto the map.
 *
 * Each archetype is a kind of building with its own proportions, material and
 * interior habits — a house is small, timber, and chopped into several rooms; a
 * warehouse is large, windowless and mostly one open space. Giving them distinct
 * rules is what stops a town looking like the same box repeated.
 *
 * Archetypes are theme, not engine. The simulation only ever sees floors, walls and
 * doorways; nothing downstream knows what a "warehouse" is.
 */

export interface Archetype {
  readonly name: string
  readonly district: DistrictId
  /** Footprint bounds in tiles, before the lot is taken into account. */
  readonly minSize: number
  readonly maxSize: number
  /** Which wall art the outside of the building uses. Renderer's business only. */
  readonly wallStyle: number
  /**
   * Which wall art the partitions inside use.
   *
   * Deliberately not the same as the outside. The exterior styles are building
   * facades — multi-storey fronts with windows and shop frontage — and using one
   * for a partition puts a shop window in somebody's hallway.
   */
  readonly interiorWallStyle: number
  readonly roofStyle: number
  /** How many steps the roof climbs before flattening off. 0 is a flat roof. */
  readonly roofRise: number
  /** How many storeys the building stands. Converted to wall courses on placement. */
  readonly storeys: number
  readonly floor: TileId
  /** Smallest a subdivided room may get. Large values mean open-plan. */
  readonly minRoom: number
  /** Proportion of exterior wall runs that get windows. */
  readonly windows: number
}

/**
 * Wall styles map to art in `render/sprites.ts`; roof styles to colours there too.
 * They are plain numbers here because `world/` must not know what brick looks like.
 */
/**
 * Wall materials.
 *
 * Only the plain wall pack, deliberately. The town pack's facades look far better
 * but each tile already depicts two or three storeys, so they cannot be stacked to
 * build a taller wall — doing it gave buildings six to twelve rows of windows on
 * two storeys of height. Plain courses stack correctly and take their glazing from
 * the pack's own window variants at storey heights.
 */
export const WallStyle = {
  Brick: 0,
  /** Plain grey. Stands in for plaster on interior partitions. */
  Plaster: 1,
  Wood: 2,
  /**
   * A low timber fence, drawn in code. Yards and field boundaries.
   *
   * A fence is a wall as far as the world is concerned — it sits on a tile edge
   * and blocks movement — just a short one, so it is a style here rather than a
   * separate mechanism. One segment tall; a gate is a Doorway in it.
   */
  Fence: 9,
} as const

export const ARCHETYPES: readonly Archetype[] = [
  {
    name: 'house',
    district: District.Residential,
    minSize: 7,
    maxSize: 11,
    wallStyle: WallStyle.Wood,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 1,
    roofRise: 4,
    storeys: 2,
    floor: Tile.Floorboards,
    minRoom: 3,
    windows: 0.7,
  },
  {
    name: 'townhouse',
    district: District.Residential,
    minSize: 8,
    maxSize: 12,
    wallStyle: WallStyle.Brick,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 2,
    roofRise: 3,
    storeys: 3,
    floor: Tile.Floorboards,
    minRoom: 3,
    windows: 0.6,
  },
  {
    name: 'shop',
    district: District.Commercial,
    minSize: 9,
    maxSize: 14,
    wallStyle: WallStyle.Brick,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 3,
    roofRise: 1,
    storeys: 2,
    floor: Tile.Tiles,
    // Shops are one room at the front with a back office, so barely subdivided.
    minRoom: 6,
    windows: 0.85,
  },
  {
    name: 'office',
    district: District.Commercial,
    minSize: 11,
    maxSize: 16,
    wallStyle: WallStyle.Plaster,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 4,
    roofRise: 0,
    storeys: 5,
    floor: Tile.Tiles,
    minRoom: 4,
    windows: 0.8,
  },
  {
    name: 'warehouse',
    district: District.Industrial,
    minSize: 13,
    maxSize: 20,
    wallStyle: WallStyle.Plaster,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 5,
    roofRise: 2,
    storeys: 2,
    floor: Tile.Concrete,
    // Deliberately larger than any warehouse, so the interior is left open.
    minRoom: 99,
    windows: 0.12,
  },
  {
    // Single storey, pitched roof: the small end of the housing stock.
    name: 'bungalow',
    district: District.Residential,
    minSize: 6,
    maxSize: 9,
    wallStyle: WallStyle.Wood,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 1,
    roofRise: 3,
    storeys: 1,
    floor: Tile.Floorboards,
    minRoom: 3,
    windows: 0.65,
  },
  {
    // A long thin box with a flat roof. Placed by the trailer-park district in
    // tight rows; proportion is enforced at placement, since min/max alone
    // cannot make a building oblong.
    name: 'trailer',
    district: District.TrailerPark,
    minSize: 4,
    maxSize: 9,
    wallStyle: WallStyle.Plaster,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 7,
    roofRise: 0,
    storeys: 1,
    floor: Tile.Floorboards,
    // One open space: nobody partitions a trailer.
    minRoom: 99,
    windows: 0.5,
  },
  {
    // Downtown. The tallest thing on the island, and visible from most of it.
    name: 'tower',
    district: District.Commercial,
    minSize: 12,
    maxSize: 17,
    wallStyle: WallStyle.Plaster,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 4,
    roofRise: 0,
    storeys: 7,
    floor: Tile.Tiles,
    minRoom: 5,
    windows: 0.85,
  },
  {
    name: 'apartment',
    district: District.Commercial,
    minSize: 10,
    maxSize: 14,
    wallStyle: WallStyle.Brick,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 2,
    roofRise: 0,
    storeys: 4,
    floor: Tile.Floorboards,
    minRoom: 3,
    windows: 0.75,
  },
  {
    // Placed on farms by name, never grown from a district.
    name: 'farmhouse',
    district: District.Countryside,
    minSize: 7,
    maxSize: 10,
    wallStyle: WallStyle.Wood,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 1,
    roofRise: 4,
    storeys: 2,
    floor: Tile.Floorboards,
    minRoom: 3,
    windows: 0.6,
  },
  {
    name: 'barn',
    district: District.Countryside,
    minSize: 9,
    maxSize: 13,
    wallStyle: WallStyle.Wood,
    interiorWallStyle: WallStyle.Wood,
    roofStyle: 8,
    roofRise: 5,
    storeys: 2,
    floor: Tile.Dirt,
    minRoom: 99,
    windows: 0.1,
  },
  {
    // Airfield. Tall single volume with a shallow roof.
    name: 'hangar',
    district: District.Countryside,
    minSize: 14,
    maxSize: 20,
    wallStyle: WallStyle.Plaster,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 5,
    roofRise: 2,
    storeys: 3,
    floor: Tile.Concrete,
    minRoom: 99,
    windows: 0.08,
  },
  {
    // A single-car outbuilding beside a house.
    name: 'garage',
    district: District.Countryside,
    minSize: 4,
    maxSize: 5,
    wallStyle: WallStyle.Wood,
    interiorWallStyle: WallStyle.Wood,
    roofStyle: 7,
    roofRise: 0,
    storeys: 1,
    floor: Tile.Concrete,
    minRoom: 99,
    windows: 0.1,
  },
  {
    name: 'depot',
    district: District.Industrial,
    minSize: 10,
    maxSize: 15,
    wallStyle: WallStyle.Brick,
    interiorWallStyle: WallStyle.Plaster,
    roofStyle: 6,
    roofRise: 1,
    storeys: 2,
    floor: Tile.Concrete,
    minRoom: 8,
    windows: 0.2,
  },
]

export function archetypesFor(district: DistrictId): readonly Archetype[] {
  return ARCHETYPES.filter((a) => a.district === district)
}

/**
 * A specific archetype by name, for the pieces of the map that are placed rather
 * than grown — farmhouses on farms, hangars on airfields. Throwing on a miss is
 * deliberate: a typo here is a build error in spirit and should fail loudly at
 * generation, not place nothing and leave an empty farm.
 */
export function archetypeNamed(name: string): Archetype {
  const found = ARCHETYPES.find((a) => a.name === name)
  if (found === undefined) throw new Error(`no archetype named "${name}"`)
  return found
}

export interface Footprint {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * Stamps a building onto the grid: floor, perimeter walls with a doorway and
 * windows, interior rooms joined by internal doorways, and a roof.
 *
 * Note which boundaries the perimeter uses. A building spanning rows `y` to
 * `y + h - 1` is closed at the top by the north wall of row `y`, and at the bottom
 * by the north wall of row `y + h` — the row *below* it — because that boundary is
 * owned by the tile south of it. Same west to east. Getting this wrong is the
 * classic edge-wall bug: the building comes out shifted a tile, or open on two sides.
 */
export function placeBuilding(
  grid: Grid,
  archetype: Archetype,
  { x, y, w, h }: Footprint,
  id: number,
  rng: Rng,
  /** Where the door should face — the settlement's centre, where its roads are.
      Defaults to the middle of the map, which is only right for a one-town map. */
  towards?: { x: number; y: number },
): void {
  const segments = archetype.storeys * SEGMENTS_PER_STOREY
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      grid.set(tx, ty, archetype.floor)
      grid.setBuilding(tx, ty, id)

      // Clear anything already standing on this tile's boundaries. A building
      // stamped over ground that held a fence once kept a run of it inside —
      // invisible from outside, and it cut the interior in two.
      if (tx > x) grid.setWall(tx, ty, WallSide.West, Wall.None)
      if (ty > y) grid.setWall(tx, ty, WallSide.North, Wall.None)

      // A hipped roof: every tile rises with its distance from the nearest eave,
      // until it reaches the ridge. Flat-topped buildings just cap the rise at
      // zero. Computing it here rather than in the renderer means the shape is
      // part of the world and will survive being saved.
      const toEdge = Math.min(tx - x, x + w - 1 - tx, ty - y, y + h - 1 - ty)
      const rise = Math.min(toEdge, archetype.roofRise)

      grid.setRoof(tx, ty, archetype.roofStyle, rise, segments)
    }
  }

  const { wallStyle } = archetype

  // The doorway faces the street: whichever side of the building is nearest the
  // map centre, since that is where the roads run.
  const door = doorSide(towards ?? { x: grid.width / 2, y: grid.height / 2 }, { x, y, w, h })
  const doorAt =
    door === 'north' || door === 'south' ? x + Math.floor(w / 2) : y + Math.floor(h / 2)

  for (let i = 0; i < w; i++) {
    const tx = x + i
    const glazed = i > 0 && i < w - 1 && rng.chance(archetype.windows)

    grid.setWall(
      tx,
      y,
      WallSide.North,
      door === 'north' && isDoorTile(tx, doorAt) ? Wall.Doorway : glazed ? Wall.Window : Wall.Solid,
      wallStyle,
      segments,
    )
    grid.setWall(
      tx,
      y + h,
      WallSide.North,
      door === 'south' && isDoorTile(tx, doorAt)
        ? Wall.Doorway
        : rng.chance(archetype.windows)
          ? Wall.Window
          : Wall.Solid,
      wallStyle,
      segments,
    )
  }

  for (let i = 0; i < h; i++) {
    const ty = y + i
    const glazed = i > 0 && i < h - 1 && rng.chance(archetype.windows)

    grid.setWall(
      x,
      ty,
      WallSide.West,
      door === 'west' && isDoorTile(ty, doorAt) ? Wall.Doorway : glazed ? Wall.Window : Wall.Solid,
      wallStyle,
      segments,
    )
    grid.setWall(
      x + w,
      ty,
      WallSide.West,
      door === 'east' && isDoorTile(ty, doorAt)
        ? Wall.Doorway
        : rng.chance(archetype.windows)
          ? Wall.Window
          : Wall.Solid,
      wallStyle,
      segments,
    )
  }

  subdivide(grid, archetype, { x, y, w, h }, rng, 0)
}

/**
 * Doorways are a single tile.
 *
 * Two tiles is over two metres of opening — wide enough to drive through, which is
 * exactly how it looked. One tile is a door, and the actor's collision radius is
 * comfortably under half a tile so it can still be walked through at any angle.
 */
function isDoorTile(position: number, doorStart: number): boolean {
  return position === doorStart
}

function doorSide(
  towards: { x: number; y: number },
  { x, y, w, h }: Footprint,
): 'north' | 'south' | 'east' | 'west' {
  const dx = x + w / 2 - towards.x
  const dy = y + h / 2 - towards.y

  // Face the road: the dominant axis decides which way the front of the building
  // looks, and the sign decides which end.
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'west' : 'east'
  return dy > 0 ? 'north' : 'south'
}

/**
 * Splits the interior into rooms by recursive bisection, with a doorway through
 * each dividing wall.
 *
 * Every wall it adds gets a gap, so no room can be sealed off — which matters more
 * than the layout being clever. A house you cannot walk through is worse than a
 * plain one.
 */
function subdivide(
  grid: Grid,
  archetype: Archetype,
  { x, y, w, h }: Footprint,
  rng: Rng,
  depth: number,
): void {
  const { minRoom } = archetype
  const segments = archetype.storeys * SEGMENTS_PER_STOREY

  // Stop when either a further split would make a room too small, or the recursion
  // has gone deep enough that rooms would be poky regardless.
  if (depth >= 3) return
  if (w < minRoom * 2 + 1 && h < minRoom * 2 + 1) return

  const splitVertically = h < minRoom * 2 + 1 ? true : w < minRoom * 2 + 1 ? false : w >= h

  if (splitVertically) {
    if (w < minRoom * 2 + 1) return

    const cut = x + rng.int(minRoom, w - minRoom - 1)
    const doorAt = y + rng.int(0, h - 2)

    for (let ty = y; ty < y + h; ty++) {
      const isDoor = ty === doorAt
      grid.setWall(
        cut,
        ty,
        WallSide.West,
        isDoor ? Wall.Doorway : Wall.Solid,
        archetype.wallStyle,
        segments,
      )
    }

    subdivide(grid, archetype, { x, y, w: cut - x, h }, rng, depth + 1)
    subdivide(grid, archetype, { x: cut, y, w: x + w - cut, h }, rng, depth + 1)
    return
  }

  if (h < minRoom * 2 + 1) return

  const cut = y + rng.int(minRoom, h - minRoom - 1)
  const doorAt = x + rng.int(0, w - 2)

  for (let tx = x; tx < x + w; tx++) {
    const isDoor = tx === doorAt
    grid.setWall(
      tx,
      cut,
      WallSide.North,
      isDoor ? Wall.Doorway : Wall.Solid,
      archetype.interiorWallStyle,
      segments,
    )
  }

  subdivide(grid, archetype, { x, y, w, h: cut - y }, rng, depth + 1)
  subdivide(grid, archetype, { x, y: cut, w, h: y + h - cut }, rng, depth + 1)
}
