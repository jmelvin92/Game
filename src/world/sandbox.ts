import { createGrid, type Grid } from '@/world/grid'
import { Tile, type TileId } from '@/world/tiles'

/**
 * A hand-built city block to walk around in.
 *
 * Written out explicitly rather than generated. Procedural generation is a real
 * problem worth solving later, but solving it now would mean debugging a generator
 * and a brand-new renderer at the same time, with no way to tell which one was
 * wrong. A fixed map is a known-good reference to check the renderer against.
 */

export const SANDBOX_SIZE = 64

/** Where the character starts: the middle of the crossroads. */
export const SPAWN = { x: SANDBOX_SIZE / 2, y: SANDBOX_SIZE / 2 } as const

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
  /** Which wall the doorway is cut into. */
  readonly door: 'north' | 'south' | 'east' | 'west'
}

/** Perimeter walls with a floor inside and a two-tile doorway, so it can be entered. */
function building(grid: Grid, { x, y, w, h, door }: Building): void {
  fill(grid, x, y, w, h, Tile.Wall)
  fill(grid, x + 1, y + 1, w - 2, h - 2, Tile.Floor)

  const midX = x + Math.floor(w / 2)
  const midY = y + Math.floor(h / 2)

  switch (door) {
    case 'north':
      fill(grid, midX - 1, y, 2, 1, Tile.Floor)
      break
    case 'south':
      fill(grid, midX - 1, y + h - 1, 2, 1, Tile.Floor)
      break
    case 'west':
      fill(grid, x, midY - 1, 1, 2, Tile.Floor)
      break
    case 'east':
      fill(grid, x + w - 1, midY - 1, 1, 2, Tile.Floor)
      break
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
