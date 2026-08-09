import type { Actor } from '@/entity/actor'
import type { Grid } from '@/world/grid'
import { isSolid } from '@/world/tiles'

/**
 * Movement and collision against solid tiles.
 */

/** True if a circle of `radius` centred at (x, y) overlaps any solid tile. */
export function blocked(grid: Grid, x: number, y: number, radius: number): boolean {
  const minX = Math.floor(x - radius)
  const maxX = Math.floor(x + radius)
  const minY = Math.floor(y - radius)
  const maxY = Math.floor(y + radius)

  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (isSolid(grid.at(tx, ty))) return true
    }
  }

  return false
}

/**
 * Advance the actor by one step.
 *
 * The two axes are resolved separately and each is kept or discarded on its own.
 * That is what produces sliding: walking diagonally into a wall keeps the component
 * running along it instead of stopping dead. Resolving both at once would snag the
 * character on every wall it brushed.
 */
export function moveActor(
  actor: Actor,
  grid: Grid,
  dirX: number,
  dirY: number,
  step: number,
): void {
  if (dirX === 0 && dirY === 0) {
    actor.moving = false
    return
  }

  actor.facingX = dirX
  actor.facingY = dirY

  const distance = actor.speed * step
  const startX = actor.x
  const startY = actor.y

  // Collision tests the destination, not the path between, so one large step could
  // skip clean over a wall. Splitting the move into pieces no longer than the actor's
  // radius makes that impossible at any speed. At walking pace this is a single
  // iteration, so the correctness costs nothing in the common case.
  const substeps = Math.max(1, Math.ceil(distance / actor.radius))
  const stepX = (dirX * distance) / substeps
  const stepY = (dirY * distance) / substeps

  for (let i = 0; i < substeps; i++) {
    const nextX = actor.x + stepX
    if (!blocked(grid, nextX, actor.y, actor.radius)) {
      actor.x = nextX
    }

    const nextY = actor.y + stepY
    if (!blocked(grid, actor.x, nextY, actor.radius)) {
      actor.y = nextY
    }
  }

  actor.moving = actor.x !== startX || actor.y !== startY
}
