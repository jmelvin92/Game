import type { Actor } from '@/entity/actor'
import type { Grid } from '@/world/grid'
import { isSolid } from '@/world/tiles'
import { propDef } from '@/world/props'
import { blocksMovement, WallSide } from '@/world/walls'

/**
 * Movement and collision.
 *
 * Walls are boundaries between tiles rather than filled tiles, so collision is
 * circle-versus-line-segment rather than a lookup. That is what lets a doorway be a
 * genuine gap the actor walks through, at any angle, rather than a special case.
 */

/** How far outside a wall segment's ends its influence still reaches, in tiles.
    Zero would let an actor clip the very corner where two walls meet. */
const SEGMENT_EPSILON = 0

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Squared distance from a point to an axis-aligned segment. */
function distanceSquaredToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const closestX = clamp(px, Math.min(ax, bx) - SEGMENT_EPSILON, Math.max(ax, bx) + SEGMENT_EPSILON)
  const closestY = clamp(py, Math.min(ay, by) - SEGMENT_EPSILON, Math.max(ay, by) + SEGMENT_EPSILON)

  const dx = px - closestX
  const dy = py - closestY

  return dx * dx + dy * dy
}

/**
 * True if a circle of `radius` centred at (x, y) overlaps a solid wall, impassable
 * ground, or the edge of the map.
 */
export function blocked(grid: Grid, x: number, y: number, radius: number): boolean {
  // The map edge is closed. Handled here rather than by ringing the border with
  // walls, so the boundary cannot be walked through by editing the map.
  if (x < radius || y < radius || x > grid.width - radius || y > grid.height - radius) {
    return true
  }

  const radiusSquared = radius * radius

  // A wall owned by tile (tx, ty) lies along that tile's own x or y line, so any
  // wall able to touch the circle belongs to a tile in this range.
  const minX = Math.floor(x - radius)
  const maxX = Math.floor(x + radius) + 1
  const minY = Math.floor(y - radius)
  const maxY = Math.floor(y + radius) + 1

  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (isSolid(grid.at(tx, ty))) {
        // Impassable ground still occupies the whole tile.
        if (x >= tx && x < tx + 1 && y >= ty && y < ty + 1) return true
      }

      // A solid prop blocks a circle at the middle of its tile — a trunk, not the
      // whole square, so woodland stays walkable.
      const prop = propDef(grid.propAt(tx, ty))
      if (prop.solid) {
        const dx = x - (tx + 0.5)
        const dy = y - (ty + 0.5)
        const reach = radius + prop.radius
        if (dx * dx + dy * dy < reach * reach) return true
      }

      // West wall: the segment from (tx, ty) to (tx, ty + 1).
      if (blocksMovement(grid.wallAt(tx, ty, WallSide.West))) {
        if (distanceSquaredToSegment(x, y, tx, ty, tx, ty + 1) < radiusSquared) return true
      }

      // North wall: the segment from (tx, ty) to (tx + 1, ty).
      if (blocksMovement(grid.wallAt(tx, ty, WallSide.North))) {
        if (distanceSquaredToSegment(x, y, tx, ty, tx + 1, ty) < radiusSquared) return true
      }
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
  running = false,
): void {
  if (dirX === 0 && dirY === 0) {
    actor.moving = false
    actor.running = false
    return
  }

  actor.facingX = dirX
  actor.facingY = dirY

  const distance = (running ? actor.runSpeed : actor.walkSpeed) * step
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
  // Holding the run key while pressed against a wall should not play a run cycle.
  actor.running = running && actor.moving
}
