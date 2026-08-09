import type { Grid } from '@/world/grid'
import { propDef } from '@/world/props'
import { wallDef, WallSide } from '@/world/walls'

/**
 * Whether one point can see another.
 *
 * This is what makes hiding possible. Without it, breaking line of sight around a
 * corner does nothing and the only way to escape anything is to outrun it — which
 * is the difference between a game about not being found and a game about running.
 *
 * Walls sit on tile boundaries, so sight is blocked by the *boundaries a line
 * crosses* rather than by the tiles it passes through. That is more work than
 * sampling tiles, and it is also the only way a doorway lets you see through a
 * wall — which is the whole point of having doorways.
 */

/** Sampling step along the ray, in tiles. Fine enough not to skip a boundary. */
const STEP = 0.2

export function hasLineOfSight(
  grid: Grid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  const dx = toX - fromX
  const dy = toY - fromY
  const distance = Math.hypot(dx, dy)
  if (distance < 0.001) return true

  const steps = Math.ceil(distance / STEP)
  let tileX = Math.floor(fromX)
  let tileY = Math.floor(fromY)

  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const x = fromX + dx * t
    const y = fromY + dy * t

    const nextX = Math.floor(x)
    const nextY = Math.floor(y)
    if (nextX === tileX && nextY === tileY) continue

    // Each axis is tested separately, so a diagonal crossing is stopped by either
    // of the two boundaries it passes rather than slipping between them.
    if (nextX !== tileX) {
      const owner = nextX > tileX ? nextX : tileX
      if (wallDef(grid.wallAt(owner, tileY, WallSide.West)).opaque) return false
    }

    if (nextY !== tileY) {
      const owner = nextY > tileY ? nextY : tileY
      if (wallDef(grid.wallAt(nextX, owner, WallSide.North)).opaque) return false
    }

    tileX = nextX
    tileY = nextY

    // A dense canopy hides what is behind it just as a wall does.
    if (propDef(grid.propAt(tileX, tileY)).opaque) return false
  }

  return true
}
