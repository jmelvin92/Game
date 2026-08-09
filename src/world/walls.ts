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
  /** No wall at all. */
  None: 0,
  Solid: 1,
  /** Solid, but with glazing at the storey heights. Blocks movement, not sight. */
  Window: 2,
  /**
   * A doorway: wall above, open at the ground.
   *
   * Its own kind rather than an absent wall, because a door is only a gap at the
   * bottom. Modelling it as no wall at all leaves a hole the full height of the
   * building — which is exactly what it looked like.
   */
  Doorway: 3,
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
  [Wall.Doorway]: { name: 'doorway', solid: false, opaque: false },
}

/**
 * How many wall segments make one storey.
 *
 * A segment of the art is roughly a metre, so three is about three metres — which
 * puts a two-storey house a little over three times the height of the person
 * standing next to it, as it should be.
 */
export const SEGMENTS_PER_STOREY = 3

/** Whether a given course of a wall is at window height. */
export function isWindowLevel(level: number): boolean {
  return level % SEGMENTS_PER_STOREY === 1
}

/** Whether a given course is part of a doorway rather than the wall above it. */
export function isDoorLevel(level: number): boolean {
  // Two courses, so a doorway is a little over head height on a person and not
  // large enough to drive through.
  return level < 2
}

export function wallDef(id: WallId): WallDef {
  return DEFS[id]
}

export function blocksMovement(id: WallId): boolean {
  return DEFS[id].solid
}
