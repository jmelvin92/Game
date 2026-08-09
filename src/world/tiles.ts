/**
 * Ground tile definitions.
 *
 * Tiles are surfaces you stand on. What blocks you is a wall, which sits on the
 * boundary between tiles — see `walls.ts`. Keeping the two separate is what makes
 * doorways and windows possible at all.
 *
 * As before, nothing here describes appearance. Colour and texture live in
 * `render/`, so changing how a road looks never touches simulation code.
 * See CLAUDE.md §5.
 */

export const Tile = {
  Grass: 0,
  Road: 1,
  Sidewalk: 2,
  Floor: 3,
} as const

export type TileId = (typeof Tile)[keyof typeof Tile]

export interface TileDef {
  readonly name: string
  /** Impassable ground — deep water, a pit. Nothing uses it yet, but ground that
      cannot be crossed is a property of the surface rather than of any wall. */
  readonly solid: boolean
}

const DEFS: Readonly<Record<TileId, TileDef>> = {
  [Tile.Grass]: { name: 'grass', solid: false },
  [Tile.Road]: { name: 'road', solid: false },
  [Tile.Sidewalk]: { name: 'sidewalk', solid: false },
  [Tile.Floor]: { name: 'floor', solid: false },
}

export function tileDef(id: TileId): TileDef {
  return DEFS[id]
}

export function isSolid(id: TileId): boolean {
  return DEFS[id].solid
}
