import { ROOF_PIECED, WallStyle } from '@/world/buildings'
import type { Grid } from '@/world/grid'
import { Prop, type PropId } from '@/world/props'
import { Tile, type TileId } from '@/world/tiles'
import { Wall, WallSide, type WallId } from '@/world/walls'

/**
 * The house: one home, laid out by hand.
 *
 * Nothing here is generated. Every wall, window, door and piece of furniture is
 * placed deliberately, because this house is the standard the generator will
 * eventually be rebuilt to meet — you cannot tune a machine for making houses
 * until one house exists that is known to be right.
 *
 * The plan, twelve tiles by nine, single storey:
 *
 *         0   1   2   3   4   5   6   7   8   9  10  11
 *       ┌───────w───────w───────┬───────────w───────w───┐
 *     0 │                       │  bookshelf            │
 *     1 │  BEDROOM              │                       w
 *     2 │  bed  night  wardrobe D  sofa                 │
 *     3 │                       │  coffee table    tv   │
 *       ├───────────────D───────┤                       │
 *     4 │  BATHROOM             │  LIVING ROOM          w
 *     5 │  toilet sink bath     │                       │
 *       ├───────────────────────┤                       │
 *     6 │  fridge stove sink    D  floor lamp           │
 *     7 w  KITCHEN              │                       │
 *     8 │  table + chairs       │                       │
 *       └───w───────w───────────┴───────D───────w───────┘
 *                                     front door
 *
 * (w = window, D = doorway.)
 */

export const HOUSE_W = 12
export const HOUSE_H = 9

/**
 * One course of wall — the timber style's frames are a whole storey of art
 * each, so a single-storey house is a single segment.
 */
const SEGMENTS = 1

const EXTERIOR = WallStyle.Timber
const INTERIOR = WallStyle.Timber

interface WallRun {
  readonly x: number
  readonly y: number
  readonly side: (typeof WallSide)[keyof typeof WallSide]
  readonly length: number
  readonly style: number
  /** Local offsets along the run that are doorways. */
  readonly doors?: readonly number[]
  /** Local offsets along the run that are windows. */
  readonly windows?: readonly number[]
}

/**
 * Every wall in the house. North runs grow along x, west runs along y.
 *
 * Windows sit where a room wants light and a passer-by gets a view in: front
 * rooms generous, bathroom none — even at the end of the world some walls stay
 * private.
 */
const WALLS: readonly WallRun[] = [
  // Exterior shell.
  { x: 0, y: 0, side: WallSide.North, length: 12, style: EXTERIOR, windows: [1, 3, 8, 10] },
  {
    x: 0,
    y: HOUSE_H,
    side: WallSide.North,
    length: 12,
    style: EXTERIOR,
    doors: [8],
    windows: [1, 3, 10],
  },
  { x: 0, y: 0, side: WallSide.West, length: 9, style: EXTERIOR, windows: [1, 7] },
  { x: HOUSE_W, y: 0, side: WallSide.West, length: 9, style: EXTERIOR, windows: [1, 4] },

  // The spine: everything west of it is private, everything east is the living
  // room. Two doors — bedroom and kitchen each open into the living space.
  { x: 6, y: 0, side: WallSide.West, length: 9, style: INTERIOR, doors: [2, 7] },

  // Bedroom floor / bathroom ceiling wall, with the en-suite door.
  { x: 0, y: 4, side: WallSide.North, length: 6, style: INTERIOR, doors: [4] },

  // Bathroom / kitchen: solid. Nobody wants the kitchen opening into the bath.
  { x: 0, y: 6, side: WallSide.North, length: 6, style: INTERIOR },
]

interface Placement {
  readonly x: number
  readonly y: number
  readonly prop: PropId
  /** 0 fronts down-left (+y), 1 down-right (+x); 2 and 3 are the backs.
      Code-drawn pieces read it modulo 2. */
  readonly facing: 0 | 1 | 2 | 3
}

/**
 * The furnishing. Long pieces — bed, sofa, bath — overflow their tile visually,
 * so the plan leaves their neighbours empty; the collision circle stays on the
 * anchor tile.
 */
const FURNITURE: readonly Placement[] = [
  // Bedroom: bed along the north wall, head by the nightstand.
  { x: 1, y: 1, prop: Prop.Bed, facing: 0 },
  { x: 3, y: 0, prop: Prop.Nightstand, facing: 0 },
  { x: 5, y: 0, prop: Prop.Wardrobe, facing: 1 },
  { x: 0, y: 3, prop: Prop.FloorLamp, facing: 0 },

  // Bathroom.
  { x: 0, y: 4, prop: Prop.Toilet, facing: 0 },
  { x: 2, y: 4, prop: Prop.Sink, facing: 0 },
  { x: 1, y: 5, prop: Prop.Bath, facing: 0 },

  // Kitchen: the working row against the north wall, the table by the windows.
  { x: 0, y: 6, prop: Prop.Fridge, facing: 0 },
  { x: 1, y: 6, prop: Prop.Counter, facing: 0 },
  { x: 2, y: 6, prop: Prop.Stove, facing: 0 },
  { x: 3, y: 6, prop: Prop.Sink, facing: 0 },
  { x: 4, y: 6, prop: Prop.Counter, facing: 0 },
  { x: 2, y: 8, prop: Prop.KitchenTable, facing: 0 },
  { x: 1, y: 8, prop: Prop.Chair, facing: 1 },
  { x: 3, y: 8, prop: Prop.Chair, facing: 3 },

  // Living room: sofa, case and television in one line down the east side, so
  // the seating faces the set and the route from the front door stays clear.
  { x: 7, y: 0, prop: Prop.Bookshelf, facing: 0 },
  { x: 10, y: 1, prop: Prop.Sofa, facing: 0 },
  { x: 10, y: 3, prop: Prop.CoffeeTable, facing: 0 },
  { x: 10, y: 5, prop: Prop.Television, facing: 2 },
  { x: 11, y: 7, prop: Prop.FloorLamp, facing: 0 },
]

/** Which rooms get boards and which get tiles. */
function floorAt(localX: number, localY: number): TileId {
  const westOfSpine = localX < 6
  if (westOfSpine && localY >= 4 && localY <= 5) return Tile.Tiles // bathroom
  if (westOfSpine && localY >= 6) return Tile.Tiles // kitchen
  return Tile.Floorboards
}

const ROOF_STYLE = ROOF_PIECED

/**
 * Stamps the house at (originX, originY), owning building id `id`.
 *
 * Furniture clears its own ground first — a house built on a map keeps whatever
 * scrub was growing there otherwise, and a willow in the living room is the
 * kind of bug that reads as a haunting.
 */
export function buildHouse(grid: Grid, originX: number, originY: number, id: number): void {
  for (let ly = 0; ly < HOUSE_H; ly++) {
    for (let lx = 0; lx < HOUSE_W; lx++) {
      const x = originX + lx
      const y = originY + ly

      grid.set(x, y, floorAt(lx, ly))
      grid.setBuilding(x, y, id)
      grid.setProp(x, y, Prop.None)

      // Clear stale boundaries, then the hipped roof.
      if (lx > 0) grid.setWall(x, y, WallSide.West, Wall.None)
      if (ly > 0) grid.setWall(x, y, WallSide.North, Wall.None)

      // A full hip: rise climbs to the ridge uncapped, so there is no flat
      // plateau — the pieced roof has slopes, corners and ridge caps, but
      // nothing to put on a flat top.
      const toEdge = Math.min(lx, HOUSE_W - 1 - lx, ly, HOUSE_H - 1 - ly)
      grid.setRoof(x, y, ROOF_STYLE, toEdge, SEGMENTS)
    }
  }

  for (const run of WALLS) {
    for (let i = 0; i < run.length; i++) {
      const x = originX + run.x + (run.side === WallSide.North ? i : 0)
      const y = originY + run.y + (run.side === WallSide.West ? i : 0)

      const kind: WallId = run.doors?.includes(i)
        ? Wall.Doorway
        : run.windows?.includes(i)
          ? Wall.Window
          : Wall.Solid
      grid.setWall(x, y, run.side, kind, run.style, SEGMENTS)
    }
  }

  for (const piece of FURNITURE) {
    grid.setProp(originX + piece.x, originY + piece.y, piece.prop, piece.facing)
  }
}
