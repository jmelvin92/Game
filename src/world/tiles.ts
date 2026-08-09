/**
 * Tile definitions.
 *
 * These carry only what the simulation structurally needs: can it be walked through,
 * can it be seen through, how tall is it. Nothing here describes appearance — colour
 * and artwork live in `render/`, so a change of art or setting never touches
 * simulation code. See CLAUDE.md §5.
 */

export const Tile = {
  Grass: 0,
  Road: 1,
  Sidewalk: 2,
  Floor: 3,
  Wall: 4,
} as const

export type TileId = (typeof Tile)[keyof typeof Tile]

export interface TileDef {
  readonly name: string
  /** Blocks movement. */
  readonly solid: boolean
  /** Blocks sight. Unused until line-of-sight exists, but it is a property of the
      tile rather than of the renderer, so it belongs here. */
  readonly opaque: boolean
  /** Height in tiles. 0 is flat ground; 1 stands a tile tall. */
  readonly height: number
}

const DEFS: Readonly<Record<TileId, TileDef>> = {
  [Tile.Grass]: { name: 'grass', solid: false, opaque: false, height: 0 },
  [Tile.Road]: { name: 'road', solid: false, opaque: false, height: 0 },
  [Tile.Sidewalk]: { name: 'sidewalk', solid: false, opaque: false, height: 0 },
  [Tile.Floor]: { name: 'floor', solid: false, opaque: false, height: 0 },
  [Tile.Wall]: { name: 'wall', solid: true, opaque: true, height: 1 },
}

export function tileDef(id: TileId): TileDef {
  return DEFS[id]
}

export function isSolid(id: TileId): boolean {
  return DEFS[id].solid
}
