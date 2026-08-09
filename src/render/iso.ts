/**
 * Isometric projection.
 *
 * Tiles are 64x32 diamonds — the standard 2:1 ratio, which keeps the maths in whole
 * numbers and the diagonals at a clean one-pixel-down-per-two-across.
 *
 *        (0,0)                 wx increases to the lower-right
 *       .  /\  .               wy increases to the lower-left
 *        /    \                sy increases downward, as in screen space
 *       /      \
 *      <   64   >     height 32
 *       \      /
 *        \    /
 *         \  /
 *
 * A subtle error in these two functions makes everything downstream look wrong for
 * reasons that are very hard to trace back here, so they are tested exhaustively —
 * including that the round trip is exact for negative coordinates.
 */

/**
 * Set by the art: the Screaming Brain Studios packs render true 2:1 isometric tiles
 * at 128×64. Because the ratio matches what was here before, adopting them changed
 * these numbers and nothing else in this file.
 */
export const TILE_W = 128
export const TILE_H = 64

const HALF_W = TILE_W / 2
const HALF_H = TILE_H / 2

/** Vertical pixels per unit of tile height. */
export const TILE_Z = 64

export interface ScreenPoint {
  readonly sx: number
  readonly sy: number
}

export interface WorldPoint {
  readonly wx: number
  readonly wy: number
}

export function worldToScreen(wx: number, wy: number, wz = 0): ScreenPoint {
  return {
    sx: (wx - wy) * HALF_W,
    sy: (wx + wy) * HALF_H - wz * TILE_Z,
  }
}

/**
 * Inverse of {@link worldToScreen} at ground level, which is what turns a mouse
 * position into a tile. Ignores height: a click selects the ground column, not
 * whatever happens to be standing in it.
 */
export function screenToWorld(sx: number, sy: number): WorldPoint {
  return {
    wx: sx / TILE_W + sy / TILE_H,
    wy: sy / TILE_H - sx / TILE_W,
  }
}

/**
 * Painter's-algorithm sort key. Larger draws later, and therefore in front.
 *
 * Tiles further from the camera have a smaller `wx + wy`, so summing the two axes
 * orders the scene back to front. Height breaks ties, so a wall draws over the
 * ground it stands on.
 */
export function depth(wx: number, wy: number, wz = 0): number {
  return wx + wy + wz
}
