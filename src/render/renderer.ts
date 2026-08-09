import type { Actor } from '@/entity/actor'
import { cameraOffset, type Camera } from '@/render/camera'
import { depth, screenToWorld, TILE_H, TILE_W, worldToScreen } from '@/render/iso'
import { facingIndex, PERSON_ANCHOR, type Sprites } from '@/render/sprites'
import type { Grid } from '@/world/grid'
import { tileDef } from '@/world/tiles'

/**
 * Draws the world.
 *
 * Reads simulation state and never writes to it — the dependency runs one way, which
 * is what lets the whole simulation be tested with no canvas in sight. See CLAUDE.md §5.
 */

const BACKGROUND = '#1b1d21'

/** Extra tiles drawn beyond the viewport edge, so tall sprites do not pop in. */
const CULL_PADDING = 3

export interface Scene {
  readonly grid: Grid
  readonly actor: Actor
  readonly camera: Camera
  readonly sprites: Sprites
  /** Seconds since start, for animation. */
  readonly time: number
}

interface Bounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/**
 * Which tiles can possibly be on screen.
 *
 * Projecting the four viewport corners back into world space gives a rotated square,
 * and its bounding box is the range worth iterating. Without this the renderer would
 * walk every tile in the map every frame, most of them nowhere near the camera.
 */
function visibleBounds(grid: Grid, ox: number, oy: number, width: number, height: number): Bounds {
  const corners = [
    screenToWorld(-ox, -oy),
    screenToWorld(width - ox, -oy),
    screenToWorld(-ox, height - oy),
    screenToWorld(width - ox, height - oy),
  ]

  const xs = corners.map((c) => c.wx)
  const ys = corners.map((c) => c.wy)

  return {
    minX: Math.max(0, Math.floor(Math.min(...xs)) - CULL_PADDING),
    minY: Math.max(0, Math.floor(Math.min(...ys)) - CULL_PADDING),
    maxX: Math.min(grid.width - 1, Math.ceil(Math.max(...xs)) + CULL_PADDING),
    maxY: Math.min(grid.height - 1, Math.ceil(Math.max(...ys)) + CULL_PADDING),
  }
}

interface Standing {
  readonly sort: number
  readonly sprite: HTMLCanvasElement
  readonly x: number
  readonly y: number
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Scene,
): void {
  const { grid, actor, camera, sprites } = scene

  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, width, height)

  const { ox, oy } = cameraOffset(camera, width, height)
  const bounds = visibleBounds(grid, ox, oy, width, height)

  // Ground first. Flat tiles never overlap each other, so they need no sorting.
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const sprite = sprites.ground.get(grid.at(x, y))
      if (sprite === undefined) continue

      const { sx, sy } = worldToScreen(x, y)
      ctx.drawImage(sprite, Math.round(ox + sx - TILE_W / 2), Math.round(oy + sy))
    }
  }

  // Anything with height overlaps its neighbours, so it must be drawn back to front.
  // The character is sorted in among the walls rather than drawn over them, which is
  // what lets it pass behind a building instead of floating in front of it.
  const standing: Standing[] = []

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const id = grid.at(x, y)
      const sprite = sprites.standing.get(id)
      if (sprite === undefined) continue

      const { sx, sy } = worldToScreen(x, y)
      standing.push({
        sort: depth(x, y),
        sprite,
        x: Math.round(ox + sx - TILE_W / 2),
        y: Math.round(oy + sy - (sprite.height - TILE_H)),
      })
    }
  }

  const person = sprites.person[facingIndex(actor.facingX, actor.facingY)]
  if (person !== undefined) {
    const { sx, sy } = worldToScreen(actor.x, actor.y)
    // A gentle bob while walking. Cheap, and it does more for the sense of motion
    // than a second set of sprites would.
    const bob = actor.moving ? Math.sin(scene.time * 11) * 1.6 : 0

    standing.push({
      sort: depth(actor.x, actor.y),
      sprite: person,
      x: Math.round(ox + sx - PERSON_ANCHOR.x),
      y: Math.round(oy + sy - PERSON_ANCHOR.y - bob),
    })
  }

  standing.sort((a, b) => a.sort - b.sort)

  for (const item of standing) {
    ctx.drawImage(item.sprite, item.x, item.y)
  }
}

/** Minimal on-screen readout. Replaced by a real HUD once there is something to report. */
export function drawHud(ctx: CanvasRenderingContext2D, actor: Actor, grid: Grid): void {
  const tileX = Math.floor(actor.x)
  const tileY = Math.floor(actor.y)
  const standingOn = grid.contains(tileX, tileY) ? tileDef(grid.at(tileX, tileY)).name : 'void'

  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.textBaseline = 'top'

  const lines = [
    'WASD or arrow keys to walk',
    `${String(tileX)}, ${String(tileY)}  ·  ${standingOn}`,
  ]

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fillRect(10, 10, 210, 8 + lines.length * 16)

  ctx.fillStyle = '#d6d9de'
  lines.forEach((line, i) => {
    ctx.fillText(line, 18, 16 + i * 16)
  })
}
