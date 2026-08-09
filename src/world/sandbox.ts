import { createGrid, type Grid } from '@/world/grid'
import { Tile, type TileId } from '@/world/tiles'
import { Wall, WallSide } from '@/world/walls'

/**
 * A hand-built city block to walk around in — and into.
 *
 * Written out explicitly rather than generated. Procedural generation is a real
 * problem worth solving later, but solving it now would mean debugging a generator
 * and a renderer at the same time, with no way to tell which one was wrong. A fixed
 * map is a known-good reference to check the renderer against.
 */

export const SANDBOX_SIZE = 64

/** Where the character starts: the middle of the crossroads. */
export const SPAWN = { x: SANDBOX_SIZE / 2 + 0.5, y: SANDBOX_SIZE / 2 + 0.5 } as const

function fill(grid: Grid, x: number, y: number, w: number, h: number, id: TileId): void {
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      grid.set(tx, ty, id)
    }
  }
}

interface Building {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  /** Which side the doorway is cut into. */
  readonly door: 'north' | 'south' | 'east' | 'west'
}

/**
 * A rectangular building: floor throughout, walls around the perimeter, one doorway
 * two tiles wide, and windows spaced along the remaining walls.
 *
 * Note which boundaries are set. The north wall of row `y` is the building's top
 * edge; its bottom edge is the north wall of the row *below* the building, because
 * that boundary is owned by the tile south of it. The same applies west to east.
 * Getting this wrong is the classic edge-wall bug — the building comes out shifted
 * by one tile, or open on two sides.
 */
function building(grid: Grid, { x, y, w, h, door }: Building): void {
  fill(grid, x, y, w, h, Tile.Floor)

  const doorA = { x: x + Math.floor(w / 2) - 1, y: y + Math.floor(h / 2) - 1 }

  for (let i = 0; i < w; i++) {
    const tx = x + i
    const isDoor = (side: 'north' | 'south'): boolean =>
      door === side && (tx === doorA.x || tx === doorA.x + 1)

    // Windows every third tile, kept clear of the corners.
    const windowish = i > 0 && i < w - 1 && i % 3 === 1

    grid.setWall(
      tx,
      y,
      WallSide.North,
      isDoor('north') ? Wall.None : windowish ? Wall.Window : Wall.Solid,
    )
    grid.setWall(
      tx,
      y + h,
      WallSide.North,
      isDoor('south') ? Wall.None : windowish ? Wall.Window : Wall.Solid,
    )
  }

  for (let i = 0; i < h; i++) {
    const ty = y + i
    const isDoor = (side: 'west' | 'east'): boolean =>
      door === side && (ty === doorA.y || ty === doorA.y + 1)

    const windowish = i > 0 && i < h - 1 && i % 3 === 1

    grid.setWall(
      x,
      ty,
      WallSide.West,
      isDoor('west') ? Wall.None : windowish ? Wall.Window : Wall.Solid,
    )
    grid.setWall(
      x + w,
      ty,
      WallSide.West,
      isDoor('east') ? Wall.None : windowish ? Wall.Window : Wall.Solid,
    )
  }
}

export function createSandbox(): Grid {
  const size = SANDBOX_SIZE
  const grid = createGrid(size, size, Tile.Grass)

  // A crossroads through the centre, with sidewalks either side of each road.
  const roadStart = size / 2 - 2
  const roadWidth = 4

  fill(grid, 0, roadStart - 1, size, roadWidth + 2, Tile.Sidewalk)
  fill(grid, roadStart - 1, 0, roadWidth + 2, size, Tile.Sidewalk)
  fill(grid, 0, roadStart, size, roadWidth, Tile.Road)
  fill(grid, roadStart, 0, roadWidth, size, Tile.Road)

  // One building per quadrant, each with its doorway facing the crossroads so
  // every interior is reachable on foot.
  building(grid, { x: 8, y: 8, w: 14, h: 11, door: 'south' })
  building(grid, { x: 42, y: 6, w: 15, h: 13, door: 'west' })
  building(grid, { x: 7, y: 41, w: 16, h: 14, door: 'east' })
  building(grid, { x: 41, y: 43, w: 14, h: 12, door: 'north' })

  return grid
}
