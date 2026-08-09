import { Tile, type TileId } from '@/world/tiles'
import { Wall, WallSide, type WallId, type WallSideId } from '@/world/walls'

/**
 * A fixed-size map: ground tiles, plus walls on tile boundaries.
 *
 * Deliberately not chunked yet. Chunking exists to stop map size being bounded by
 * memory, which is not a problem a sandbox has, and adding it now would mean writing
 * streaming logic against a renderer that has barely drawn anything.
 */
export interface Grid {
  readonly width: number
  readonly height: number

  at(x: number, y: number): TileId
  set(x: number, y: number, id: TileId): void
  contains(x: number, y: number): boolean

  /** The wall on the given boundary of this tile. See `walls.ts` for the sides. */
  wallAt(x: number, y: number, side: WallSideId): WallId
  setWall(x: number, y: number, side: WallSideId, id: WallId): void
}

export function createGrid(width: number, height: number, fill: TileId): Grid {
  const tiles = new Uint8Array(width * height).fill(fill)

  // One array per side. Storing both on the tile that owns them means every
  // boundary exists exactly once, so there is no pair of values to keep in step.
  const westWalls = new Uint8Array(width * height)
  const northWalls = new Uint8Array(width * height)

  const contains = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height

  return {
    width,
    height,
    contains,

    at(x: number, y: number): TileId {
      if (!contains(x, y)) return Tile.Grass
      return (tiles[y * width + x] ?? Tile.Grass) as TileId
    },

    set(x: number, y: number, id: TileId): void {
      if (!contains(x, y)) return
      tiles[y * width + x] = id
    },

    wallAt(x: number, y: number, side: WallSideId): WallId {
      if (!contains(x, y)) return Wall.None

      const store = side === WallSide.West ? westWalls : northWalls
      return (store[y * width + x] ?? Wall.None) as WallId
    },

    setWall(x: number, y: number, side: WallSideId, id: WallId): void {
      if (!contains(x, y)) return

      const store = side === WallSide.West ? westWalls : northWalls
      store[y * width + x] = id
    },
  }
}
