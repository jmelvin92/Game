/**
 * Walls.
 *
 * A wall sits on the **boundary between two tiles**, not inside one. That is the
 * only way a building can have an inside: a doorway is a boundary with no wall on
 * it, and a window is a boundary you can see through but not walk through. A wall
 * that filled a whole tile could be neither.
 *
 * Each tile owns the two boundaries on its far side from the camera:
 *
 *   - `west`  — shared with the tile at (x - 1, y). Runs down-left across the screen.
 *   - `north` — shared with the tile at (x, y - 1). Runs down-right across the screen.
 *
 * Every boundary in the map is therefore owned exactly once, with no duplicates to
 * keep in step. The names follow the Tiled and Project Zomboid convention.
 *
 * As with tiles, nothing here describes appearance — only what the simulation needs.
 */

export const WallSide = {
  West: 0,
  North: 1,
} as const

export type WallSideId = (typeof WallSide)[keyof typeof WallSide]

export const Wall = {
  /** No wall: an open boundary, which is what a doorway is. */
  None: 0,
  Solid: 1,
  /** Blocks movement, but not sight. */
  Window: 2,
} as const

export type WallId = (typeof Wall)[keyof typeof Wall]

export interface WallDef {
  readonly name: string
  /** Blocks movement. */
  readonly solid: boolean
  /** Blocks sight. Unused until line-of-sight exists, but it is a property of the
      wall rather than of the renderer, so it belongs here. */
  readonly opaque: boolean
}

const DEFS: Readonly<Record<WallId, WallDef>> = {
  [Wall.None]: { name: 'none', solid: false, opaque: false },
  [Wall.Solid]: { name: 'solid', solid: true, opaque: true },
  [Wall.Window]: { name: 'window', solid: true, opaque: false },
}

export function wallDef(id: WallId): WallDef {
  return DEFS[id]
}

export function blocksMovement(id: WallId): boolean {
  return DEFS[id].solid
}
