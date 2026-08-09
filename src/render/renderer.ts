import type { Actor } from '@/entity/actor'
import { cameraOffset, type Camera } from '@/render/camera'
import { depth, screenToWorld, TILE_H, TILE_W, TILE_Z, worldToScreen } from '@/render/iso'
import {
  Animation,
  ANIMATIONS,
  facingIndex,
  ROOF_STEP,
  PROP_ANCHOR,
  WALL_H,
  WALL_W,
  wallSpriteKey,
  type Sprites,
} from '@/render/sprites'
import type { Grid } from '@/world/grid'
import type { Light } from '@/render/lighting'
import { Prop, propLight } from '@/world/props'
import { tileDef } from '@/world/tiles'
import { Wall, WallSide } from '@/world/walls'

/**
 * Draws the world.
 *
 * Reads simulation state and never writes to it — the dependency runs one way, which
 * is what lets the whole simulation be tested with no canvas in sight. See CLAUDE.md §5.
 */

const BACKGROUND = '#1b1d21'

/** Extra tiles drawn beyond the viewport edge, so tall sprites do not pop in. */
const CULL_PADDING = 3

/** Blank pixels below the character's feet in their sprite frame. */
const FOOT_INSET = 0

export interface Scene {
  readonly grid: Grid
  readonly actor: Actor
  readonly camera: Camera
  readonly sprites: Sprites
  /** Seconds since start, for animation. */
  readonly time: number
  /** Fraction of the day elapsed; drives the lighting. */
  readonly dayFraction: number
  /** Whether the character's torch is on. */
  readonly torch: boolean
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
  readonly alpha: number
}

/**
 * Wall cutaway.
 *
 * The camera looks down from the north-west, so the south and east walls of any
 * building stand between it and everything inside — including the character. Left
 * alone, walking into a room means disappearing behind its own front wall.
 *
 * Walls nearer the camera than the character fade as they approach them, which
 * opens a soft window into the room that follows them around. They fade rather than
 * vanish so the room's shape stays readable; a wall that disappears entirely makes
 * it hard to tell where you are.
 */

/** Within this distance a wall is at its most transparent. */
const CUTAWAY_INNER = 1.2

/** Beyond this distance walls are untouched. */
const CUTAWAY_OUTER = 3.5

/** How much of a faded wall still shows. */
const CUTAWAY_MIN_ALPHA = 0.22

/**
 * Opacity for a wall whose midpoint is at (midX, midY), given where the actor is.
 *
 * @returns 1 for walls that cannot be in the way, ramping to {@link CUTAWAY_MIN_ALPHA}.
 */
export function cutawayOpacity(midX: number, midY: number, actorX: number, actorY: number): number {
  // Only walls nearer the camera than the actor can hide them. Depth in this
  // projection is x + y, so anything at or below the actor's is behind them.
  if (midX + midY <= actorX + actorY) return 1

  const distance = Math.hypot(midX - actorX, midY - actorY)
  if (distance >= CUTAWAY_OUTER) return 1
  if (distance <= CUTAWAY_INNER) return CUTAWAY_MIN_ALPHA

  const t = (distance - CUTAWAY_INNER) / (CUTAWAY_OUTER - CUTAWAY_INNER)
  return CUTAWAY_MIN_ALPHA + (1 - CUTAWAY_MIN_ALPHA) * t
}

/**
 * How tall this building's walls stand, in segments.
 *
 * Read from a perimeter wall rather than stored per tile: the roof has to land on
 * top of the walls, and the walls are the thing that knows how high they are.
 */
function wallHeight(grid: Grid, x: number, y: number): number {
  for (const [tx, ty, side] of [
    [x, y, WallSide.North],
    [x, y, WallSide.West],
    [x, y + 1, WallSide.North],
    [x + 1, y, WallSide.West],
  ] as const) {
    const segments = grid.wallSegmentsAt(tx, ty, side)
    if (segments > 0) return segments
  }
  return 1
}

/**
 * A stable pseudo-random number per tile, for choosing a ground variant.
 *
 * Deterministic on position rather than actually random: the same tile must pick
 * the same variant on every frame, or the ground crawls.
 */
function groundVariant(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2545f491)
  return (h ^ (h >>> 13)) >>> 0
}

/**
 * Draws the world and reports the lights it found.
 *
 * Returning them rather than writing them into the scene keeps the one-way rule
 * intact: the renderer reads simulation state and never writes to it. The lighting
 * pass then runs over the finished image.
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Scene,
): readonly Light[] {
  const { grid, actor, camera, sprites } = scene

  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, width, height)

  const { ox, oy } = cameraOffset(camera, width, height)
  const bounds = visibleBounds(grid, ox, oy, width, height)

  // Ground first. Flat tiles never overlap each other, so they need no sorting.
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const variants = sprites.ground.get(grid.at(x, y))
      if (variants === undefined || variants.length === 0) continue

      // Which variant a tile uses is fixed by its position, so the ground is
      // varied but never shimmers between frames.
      const sprite = variants[groundVariant(x, y) % variants.length]
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
      const { sx, sy } = worldToScreen(x, y)

      for (const side of [WallSide.West, WallSide.North] as const) {
        const wall = grid.wallAt(x, y, side)
        if (wall === Wall.None) continue

        const sprite = sprites.walls.get(wallSpriteKey(wall, side, grid.wallStyleAt(x, y, side)))
        if (sprite === undefined) continue

        // A west wall runs down-left from the tile's top vertex, so it occupies the
        // half-diamond to the left; a north wall runs down-right, occupying the
        // half to the right.
        const left = side === WallSide.West ? sx - WALL_W : sx

        // Midpoint of the boundary the wall sits on, which is what the cutaway
        // measures against — not the tile's centre.
        const midX = side === WallSide.West ? x : x + 0.5
        const midY = side === WallSide.West ? y + 0.5 : y
        const alpha = cutawayOpacity(midX, midY, actor.x, actor.y)

        // A wall segment is about a metre of height, so a building is several
        // stacked. Drawing bottom upward means each course overlaps the one below
        // it, hiding the seam where they meet.
        const segments = Math.max(1, grid.wallSegmentsAt(x, y, side))

        for (let level = 0; level < segments; level++) {
          standing.push({
            // Walls sit on a tile's far boundaries, so they draw fractionally
            // before anything standing in that tile — that is what puts the
            // character *inside* the room rather than in front of its back wall.
            // Higher courses draw after lower ones.
            sort: depth(x, y) - 0.5 + level * 0.001,
            sprite,
            x: Math.round(ox + left),
            y: Math.round(oy + sy - WALL_H + TILE_H / 2 - level * TILE_Z),
            alpha,
          })
        }
      }
    }
  }

  // Vegetation, sorted in with the walls and the character so a tree can stand in
  // front of or behind either.
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const prop = grid.propAt(x, y)
      if (prop === Prop.None) continue

      const variants = sprites.props.get(prop)
      const sprite = variants?.[grid.propVariantAt(x, y) % Math.max(1, variants.length)]
      if (sprite === undefined) continue

      // Anchored at the middle of the tile rather than its corner, so the trunk
      // sits where the collision circle is. Every species shares one frame size,
      // so there is no per-species offset to get wrong.
      const { sx, sy } = worldToScreen(x + 0.5, y + 0.5)

      standing.push({
        sort: depth(x, y),
        sprite,
        x: Math.round(ox + sx - PROP_ANCHOR.x),
        y: Math.round(oy + sy - PROP_ANCHOR.y),
        alpha: 1,
      })
    }
  }

  // The roof comes off the building you are standing in, and stays on every other.
  // Fading it instead would still leave the interior unreadable, and a building
  // whose roof is simply absent reads clearly as the one you are inside.
  const occupied = grid.buildingAt(Math.floor(actor.x), Math.floor(actor.y))

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const style = grid.roofAt(x, y)
      if (style === 0) continue
      if (occupied !== 0 && grid.buildingAt(x, y) === occupied) continue

      const sprite = sprites.roofs[style]
      if (sprite === undefined) continue

      const { sx, sy } = worldToScreen(x, y)
      // Roofs cap the walls, so they sit at the building's full wall height, plus
      // however far this part of the hip has climbed toward the ridge.
      const rise = grid.roofHeightAt(x, y) * ROOF_STEP + wallHeight(grid, x, y) * TILE_Z

      standing.push({
        // A storey above the ground, and drawn after everything at this tile so it
        // covers the walls it sits on. Higher parts of the roof draw later still,
        // so the ridge overlaps the courses below it rather than the reverse.
        sort: depth(x, y) + 0.25 + grid.roofHeightAt(x, y) * 0.01,
        sprite,
        x: Math.round(ox + sx - TILE_W / 2),
        y: Math.round(oy + sy - rise),
        alpha: 1,
      })
    }
  }

  // Which animation is playing follows from what the actor is doing, so the
  // renderer never has to be told — one less thing to keep in step.
  const animation = actor.moving ? (actor.running ? Animation.Run : Animation.Walk) : Animation.Idle
  const { frameTime } = ANIMATIONS[animation]

  const facings = sprites.character.get(animation)
  const cells = facings?.[facingIndex(actor.facingX, actor.facingY)]
  // Frame count comes from the loaded art rather than the table, so a sheet that
  // holds a different number than expected still plays instead of drawing nothing.
  const person =
    cells === undefined || cells.length === 0
      ? undefined
      : cells[Math.floor(scene.time / frameTime) % cells.length]

  if (person !== undefined) {
    const { sx, sy } = worldToScreen(actor.x, actor.y)

    standing.push({
      // Sorted by the tile the actor stands in, not their exact position, so they
      // compare consistently against that tile's walls.
      sort: depth(Math.floor(actor.x), Math.floor(actor.y)),
      sprite: person,
      // Anchored from the sprite's own size rather than a constant, because the
      // placeholder and the real art are different dimensions and either may be in
      // use if a sheet fails to load.
      x: Math.round(ox + sx - person.width / 2),
      y: Math.round(oy + sy - person.height + FOOT_INSET),
      alpha: 1,
    })
  }

  // Lights are gathered while the scene is still in world space, then handed to
  // the lighting pass in screen coordinates.
  const lights: Light[] = []

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const emitted = propLight(grid.propAt(x, y))
      if (emitted === undefined) continue

      const { sx, sy } = worldToScreen(x + 0.5, y + 0.5)
      lights.push({
        x: ox + sx,
        y: oy + sy - emitted.height * TILE_Z,
        radius: emitted.radius * TILE_W * 0.5,
        strength: emitted.strength,
        colour: 'rgba(255, 196, 118, 0.75)',
      })
    }
  }

  if (scene.torch) {
    const { sx, sy } = worldToScreen(actor.x, actor.y)
    // Point the cone the way the character faces, converted to screen space —
    // the same projection the sprites use, so the beam and the body agree.
    const screenDirX = actor.facingX - actor.facingY
    const screenDirY = (actor.facingX + actor.facingY) / 2

    lights.push({
      x: ox + sx,
      y: oy + sy - TILE_Z * 0.55,
      radius: TILE_W * 3.4,
      strength: 1,
      colour: 'rgba(226, 236, 255, 0.55)',
      direction: Math.atan2(screenDirY, screenDirX),
      cone: Math.PI / 3.2,
    })

    // A small pool at the feet, so the character is not a silhouette behind their
    // own torch.
    lights.push({
      x: ox + sx,
      y: oy + sy - TILE_Z * 0.3,
      radius: TILE_W * 0.85,
      strength: 0.65,
      colour: 'rgba(200, 214, 245, 0.5)',
    })
  }

  standing.sort((a, b) => a.sort - b.sort)

  for (const item of standing) {
    ctx.globalAlpha = item.alpha
    ctx.drawImage(item.sprite, item.x, item.y)
  }

  ctx.globalAlpha = 1

  return lights
}

/** Minimal on-screen readout. Replaced by a real HUD once there is something to report. */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  actor: Actor,
  grid: Grid,
  time: string,
  torch: boolean,
): void {
  const tileX = Math.floor(actor.x)
  const tileY = Math.floor(actor.y)
  const standingOn = grid.contains(tileX, tileY) ? tileDef(grid.at(tileX, tileY)).name : 'void'

  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.textBaseline = 'top'

  const lines = [
    'WASD or arrows to walk  ·  shift to run  ·  F for torch',
    `${time}  ·  ${String(tileX)}, ${String(tileY)}  ·  ${standingOn}${torch ? '  ·  torch on' : ''}`,
  ]

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fillRect(10, 10, 330, 8 + lines.length * 16)

  ctx.fillStyle = '#d6d9de'
  lines.forEach((line, i) => {
    ctx.fillText(line, 18, 16 + i * 16)
  })
}
