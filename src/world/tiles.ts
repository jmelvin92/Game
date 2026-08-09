/**
 * Ground tile definitions.
 *
 * Tiles are surfaces you stand on. What blocks you is a wall, which sits on the
 * boundary between tiles — see `walls.ts`. Keeping the two separate is what makes
 * doorways and windows possible at all.
 *
 * Nothing here describes appearance. Texture lives in `render/`, so changing how a
 * road looks never touches simulation code. See CLAUDE.md §5.
 */

export const Tile = {
  Grass: 0,
  Road: 1,
  Sidewalk: 2,
  /** Domestic interior. */
  Floorboards: 3,
  /** Shop and office interior. */
  Tiles: 4,
  /** Industrial interior. */
  Concrete: 5,
  /** Bare earth. Farm tracks and worked fields out in the country. */
  Dirt: 6,
  /** Stony ground, too poor to have been farmed. */
  Rock: 7,
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
  [Tile.Floorboards]: { name: 'floorboards', solid: false },
  [Tile.Tiles]: { name: 'tiles', solid: false },
  [Tile.Concrete]: { name: 'concrete', solid: false },
  [Tile.Dirt]: { name: 'dirt', solid: false },
  [Tile.Rock]: { name: 'rock', solid: false },
}

export function tileDef(id: TileId): TileDef {
  return DEFS[id]
}

export function isSolid(id: TileId): boolean {
  return DEFS[id].solid
}
