/**
 * An actor is anything that occupies a position and moves under its own power.
 * Right now that is only the player, but nothing here is player-specific.
 */

export interface Actor {
  /** Position in tiles, fractional. */
  x: number
  y: number
  /** Facing as a unit vector in world space. Kept when idle so the character does
      not snap back to a default direction the moment the keys are released. */
  facingX: number
  facingY: number
  /** Tiles per second. */
  speed: number
  /** Collision radius in tiles. Comfortably under half a tile, so a one-tile
      doorway can be walked through without catching on the frame. */
  radius: number
  /** Whether the actor moved on the last simulation step; drives walk animation. */
  moving: boolean
}

export function createActor(x: number, y: number): Actor {
  return {
    x,
    y,
    // Facing south-east on screen, which reads as "towards the camera".
    facingX: 1,
    facingY: 1,
    speed: 4.2,
    radius: 0.28,
    moving: false,
  }
}
