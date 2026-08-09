import { Tile, type TileId } from '@/world/tiles'

/**
 * A fixed-size tile map.
 *
 * Deliberately not chunked yet. Chunking exists to stop map size being bounded by
 * memory, which is not a problem a sandbox has, and adding it now would mean writing
 * streaming logic against a renderer that has never drawn anything.
 */
export interface Grid {
  readonly width: number
  readonly height: number
  at(x: number, y: number): TileId
  set(x: number, y: number, id: TileId): void
  contains(x: number, y: number): boolean
}

export function createGrid(width: number, height: number, fill: TileId): Grid {
  const tiles = new Uint8Array(width * height).fill(fill)

  const contains = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height

  return {
    width,
    height,
    contains,

    at(x: number, y: number): TileId {
      // Out of bounds reads as wall. That gives the map a solid edge for free:
      // collision, and later pathfinding and line of sight, all stop at the border
      // without any of them needing a special case for it.
      if (!contains(x, y)) return Tile.Wall
      return (tiles[y * width + x] ?? Tile.Wall) as TileId
    },

    set(x: number, y: number, id: TileId): void {
      if (!contains(x, y)) return
      tiles[y * width + x] = id
    },
  }
}
