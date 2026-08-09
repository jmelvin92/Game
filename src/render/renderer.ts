import type { Clock } from '@/core/time'
import type { Actor } from '@/entity/actor'
import type { Hunter } from '@/entity/hunters'
import type { Sun } from '@/render/daylight'
import { cameraOffset, type Camera } from '@/render/camera'
import { depth, screenToWorld, TILE_H, TILE_W, TILE_Z, worldToScreen } from '@/render/iso'
import {
  Animation,
  ANIMATIONS,
  facingIndex,
  ROOF_STEP,
  WALL_H,
  WALL_W,
  wallSpriteKey,
  type Sprites,
} from '@/render/sprites'
import type { Grid } from '@/world/grid'
import { flicker, type Light } from '@/render/lighting'
import { LampCondition, Prop, propLight } from '@/world/props'
import { Tile, tileDef } from '@/world/tiles'
import { isDoorLevel, isWindowLevel, Wall, WallSide } from '@/world/walls'

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
  /** 0 to 1. The torch dims with it, so running low is visible in the world. */
  readonly power: number
  /** Everything hunting the player, drawn and sorted alongside them. */
  readonly hunters: readonly Hunter[]
  /** The sun, for shadows and shading. */
  readonly sun: Sun
  /** Scratch canvas for the shadow pass, reused between frames. */
  readonly shadowBuffer: HTMLCanvasElement
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
  const raw = rawBounds(ox, oy, width, height)
  return {
    minX: Math.max(0, raw.minX),
    minY: Math.max(0, raw.minY),
    maxX: Math.min(grid.width - 1, raw.maxX),
    maxY: Math.min(grid.height - 1, raw.maxY),
  }
}

/** The same range unclamped, for the one pass that draws past the edge of the map. */
function rawBounds(ox: number, oy: number, width: number, height: number): Bounds {
  const corners = [
    screenToWorld(-ox, -oy),
    screenToWorld(width - ox, -oy),
    screenToWorld(-ox, height - oy),
    screenToWorld(width - ox, height - oy),
  ]

  const xs = corners.map((c) => c.wx)
  const ys = corners.map((c) => c.wy)

  return {
    minX: Math.floor(Math.min(...xs)) - CULL_PADDING,
    minY: Math.floor(Math.min(...ys)) - CULL_PADDING,
    maxX: Math.ceil(Math.max(...xs)) + CULL_PADDING,
    maxY: Math.ceil(Math.max(...ys)) + CULL_PADDING,
  }
}

interface Standing {
  readonly sort: number
  readonly sprite: HTMLCanvasElement
  readonly x: number
  readonly y: number
  /** Not readonly: the occlusion pass lowers it for anything covering the player. */
  alpha: number
  /** 0 to 1. Darkens the sprite, for surfaces turned away from the sun. */
  readonly shade?: number
}

/** How much of a thing is left showing when it is covering the player. */
const OCCLUDER_ALPHA = 0.24

/** Screen pixels around the player within which an occluder starts to fade. */
const OCCLUDER_MARGIN = 26

/**
 * Fades anything drawn on top of the player that overlaps them.
 *
 * The wall cutaway cannot do this job. It fades by distance in world space, which
 * was right when a wall was one course tall — but a five-storey building reaches
 * far up the screen, so its base can be well away from the player while its upper
 * courses sit squarely over them. Roofs were never faded at all.
 *
 * Occlusion is a screen-space problem, so this is a screen-space test: is it drawn
 * later than the player, and does its rectangle overlap theirs. That catches walls,
 * roofs, trees and anything added later without any of them having to know.
 */
function revealPlayer(standing: Standing[], player: Standing): void {
  const left = player.x - OCCLUDER_MARGIN
  const right = player.x + player.sprite.width + OCCLUDER_MARGIN
  const top = player.y - OCCLUDER_MARGIN
  const bottom = player.y + player.sprite.height + OCCLUDER_MARGIN

  for (const item of standing) {
    if (item === player) continue
    // Only things that draw after the player can hide them.
    if (item.sort <= player.sort) continue

    if (
      item.x + item.sprite.width < left ||
      item.x > right ||
      item.y + item.sprite.height < top ||
      item.y > bottom
    ) {
      continue
    }

    item.alpha = Math.min(item.alpha, OCCLUDER_ALPHA)
  }
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
  //
  // This one pass runs unclamped: the world is an island, and everywhere beyond
  // the map is sea. Painting water past the edge is what removes the black void
  // that otherwise shows wherever the camera can see off the map — the border is
  // the horizon, not the end of the render.
  const raw = rawBounds(ox, oy, width, height)
  for (let y = raw.minY; y <= raw.maxY; y++) {
    for (let x = raw.minX; x <= raw.maxX; x++) {
      const tile = grid.contains(x, y) ? grid.at(x, y) : Tile.Water
      const variants = sprites.ground.get(tile)
      if (variants === undefined || variants.length === 0) continue

      // Which variant a tile uses is fixed by its position, so the ground is
      // varied but never shimmers between frames.
      const sprite = variants[groundVariant(x, y) % variants.length]
      if (sprite === undefined) continue

      const { sx, sy } = worldToScreen(x, y)
      ctx.drawImage(sprite, Math.round(ox + sx - TILE_W / 2), Math.round(oy + sy))
    }
  }

  // Shadows, before anything standing.
  //
  // Drawn into their own buffer at full strength and composited once, rather than
  // straight onto the scene. Overlapping shadows would otherwise stack into black
  // where a tree stands beside a building, which is both wrong and very obvious.
  if (scene.sun.shadowAlpha > 0.002 && scene.sun.elevation > 0.01) {
    const { sun, shadowBuffer } = scene

    if (shadowBuffer.width !== Math.ceil(width) || shadowBuffer.height !== Math.ceil(height)) {
      shadowBuffer.width = Math.ceil(width)
      shadowBuffer.height = Math.ceil(height)
    }

    const shade = shadowBuffer.getContext('2d')
    if (shade !== null) {
      shade.clearRect(0, 0, width, height)
      shade.fillStyle = '#000'

      // Buildings: the footprint, offset by the building's height. Cast from the
      // roof rather than the walls, because the roof is the shape that blocks the
      // sun and it is one quad per tile instead of several.
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let x = bounds.minX; x <= bounds.maxX; x++) {
          if (grid.roofAt(x, y) === 0) continue

          // Every tile of the footprint casts, not just the edges. Casting only
          // from the perimeter seems like a saving and is not: the offset shadow
          // comes out as a hollow ring rather than a solid shape, because the
          // middle of the footprint is exactly what fills the middle of its shadow.
          const height3d = grid.roofBaseAt(x, y) + grid.roofHeightAt(x, y) * 0.2
          const { sx, sy } = worldToScreen(x, y)

          shade.save()
          shade.translate(ox + sx + sun.shadowX * height3d, oy + sy + sun.shadowY * height3d)
          shade.beginPath()
          shade.moveTo(0, 0)
          shade.lineTo(TILE_W / 2, TILE_H / 2)
          shade.lineTo(0, TILE_H)
          shade.lineTo(-TILE_W / 2, TILE_H / 2)
          shade.closePath()
          shade.fill()
          shade.restore()
        }
      }

      // Props: the sprite itself, flattened toward the ground and leaned in the
      // direction the light is going. Reusing the sprite means a tree's shadow is
      // tree-shaped for free, which no amount of drawn shapes would match.
      for (let y = bounds.minY; y <= bounds.maxY; y++) {
        for (let x = bounds.minX; x <= bounds.maxX; x++) {
          const prop = grid.propAt(x, y)
          if (prop === Prop.None) continue

          const variants = sprites.props.get(prop)
          const sprite = variants?.[grid.propVariantAt(x, y) % Math.max(1, variants.length)]
          if (sprite === undefined) continue

          const { sx, sy } = worldToScreen(x + 0.5, y + 0.5)

          shade.save()
          shade.translate(ox + sx, oy + sy)
          // Shear leans the sprite over; the vertical squash lays it on the ground.
          shade.transform(1, 0, sun.shadowX / 26, sun.shadowY / 26, 0, 0)
          shade.globalAlpha = 1
          shade.drawImage(sprite, -sprite.width / 2, -(sprite.height - 6))
          shade.restore()
        }
      }

      ctx.save()
      ctx.globalAlpha = sun.shadowAlpha
      ctx.drawImage(shadowBuffer, 0, 0)
      ctx.restore()
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

        const style = grid.wallStyleAt(x, y, side)
        const solid = sprites.walls.get(wallSpriteKey(Wall.Solid, side, style))
        const glazed = sprites.walls.get(wallSpriteKey(Wall.Window, side, style))
        if (solid === undefined) continue

        // A west wall runs down-left from the tile's top vertex, so it occupies the
        // half-diamond to the left; a north wall runs down-right, occupying the
        // half to the right.
        const left = side === WallSide.West ? sx - WALL_W : sx

        // Midpoint of the boundary the wall sits on, which is what the cutaway
        // measures against — not the tile's centre.
        const midX = side === WallSide.West ? x : x + 0.5
        const midY = side === WallSide.West ? y + 0.5 : y
        const alpha = cutawayOpacity(midX, midY, actor.x, actor.y)

        // One face of every building is turned away from the sun. Shading it is
        // most of what makes a box read as solid rather than as flat panels.
        const backlit = side === (scene.sun.shadowX > 0 ? WallSide.West : WallSide.North)

        // A wall segment is about a metre of height, so a building is several
        // stacked. Drawing bottom upward means each course overlaps the one below
        // it, hiding the seam where they meet.
        const segments = Math.max(1, grid.wallSegmentsAt(x, y, side))

        for (let level = 0; level < segments; level++) {
          // A wall's kind describes the whole boundary; which course this is
          // decides what actually gets drawn. That distinction is the fix for two
          // things at once: a doorway is now an opening at the bottom with wall
          // above it rather than a slot the full height of the building, and
          // glazing lands at storey heights instead of on every course.
          if (wall === Wall.Doorway && isDoorLevel(level)) continue

          const sprite =
            wall === Wall.Window && isWindowLevel(level) && glazed !== undefined ? glazed : solid

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
            shade: backlit ? scene.sun.backlitShade : 0,
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
        // Anchored from the sprite's own frame, not the shared constants —
        // furniture ships wider frames than the flora does.
        x: Math.round(ox + sx - sprite.width / 2),
        y: Math.round(oy + sy - (sprite.height - 6)),
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
      const rise = grid.roofHeightAt(x, y) * ROOF_STEP + grid.roofBaseAt(x, y) * TILE_Z

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
  // Lights are gathered while the scene is still in world space, then handed to
  // the lighting pass in screen coordinates.
  const lights: Light[] = []

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const emitted = propLight(grid.propAt(x, y))
      if (emitted === undefined) continue

      // Nothing is lit unless the player has paid for it. A device with no charge
      // left is simply dark, which is why the whole town is.
      const charge = grid.chargeAt(x, y)
      if (charge <= 0) continue

      // Damaged fittings stutter the entire time they burn, each on its own
      // rhythm so a street never blinks in unison. Devices no longer gutter out
      // — a loan burns steadily until it is called back.
      // Condition lives in the variant for lamps alone; furniture keeps its
      // facing there, and a bed should not stutter like a failing tube.
      const damaged =
        grid.propAt(x, y) === Prop.LampPost && grid.propVariantAt(x, y) === LampCondition.Damaged
      const stutter = damaged ? flicker(x * 7 + y * 13, scene.time) : 1

      const { sx, sy } = worldToScreen(x + 0.5, y + 0.5)
      lights.push({
        x: ox + sx,
        y: oy + sy - emitted.height * TILE_Z,
        radius: emitted.radius * TILE_W * 0.5,
        strength: emitted.strength * stutter,
        colour: emitted.colour ?? 'rgba(255, 190, 112, ALPHA)',
      })
    }
  }

  if (scene.torch) {
    const { sx, sy } = worldToScreen(actor.x, actor.y)

    // The torch runs on the same gift as everything else, so it fades as that
    // does — the beam shortening is the warning, rather than a number falling.
    const torchStrength = 0.35 + Math.min(1, scene.power / 0.4) * 0.65

    // Point the cone the way the character faces, converted to screen space —
    // the same projection the sprites use, so the beam and the body agree.
    const screenDirX = actor.facingX - actor.facingY
    const screenDirY = (actor.facingX + actor.facingY) / 2

    lights.push({
      x: ox + sx,
      y: oy + sy - TILE_Z * 0.55,
      radius: TILE_W * (2.2 + torchStrength * 2),
      strength: torchStrength,
      colour: 'rgba(222, 233, 255, ALPHA)',
      direction: Math.atan2(screenDirY, screenDirX),
      cone: Math.PI / 3.2,
    })

    // A small pool at the feet, so the character is not a silhouette behind their
    // own torch.
    lights.push({
      x: ox + sx,
      y: oy + sy - TILE_Z * 0.3,
      radius: TILE_W * 1.15,
      strength: 0.65 * torchStrength,
      colour: 'rgba(198, 212, 244, ALPHA)',
    })
  }

  /** Places one figure into the draw list, choosing its frame from what it is doing. */
  const drawFigure = (
    name: string,
    x: number,
    y: number,
    facingX: number,
    facingY: number,
    moving: boolean,
    running: boolean,
    bobbing: boolean,
  ): Standing | undefined => {
    const animation = moving ? (running ? Animation.Run : Animation.Walk) : Animation.Idle
    const { frameTime } = ANIMATIONS[animation]

    const cells = sprites.characters.get(name)?.get(animation)?.[facingIndex(facingX, facingY)]
    if (cells === undefined || cells.length === 0) return undefined

    // Frame count comes from the loaded art rather than the table, so a sheet
    // holding a different number than expected still plays.
    const sprite = cells[Math.floor(scene.time / frameTime) % cells.length]
    if (sprite === undefined) return undefined

    const { sx, sy } = worldToScreen(x, y)
    // A gentle bob while moving, for the player only — the White Eyes should not
    // read as jaunty.
    const bob = bobbing && moving ? Math.sin(scene.time * 11) * 1.6 : 0

    const figure: Standing = {
      // Sorted by the tile they stand in, not their exact position, so they
      // compare consistently against that tile's walls.
      sort: depth(Math.floor(x), Math.floor(y)),
      sprite,
      x: Math.round(ox + sx - sprite.width / 2),
      y: Math.round(oy + sy - sprite.height + FOOT_INSET - bob),
      alpha: 1,
    }

    standing.push(figure)
    return figure
  }

  for (const hunter of scene.hunters) {
    // Always running when they move. They do not stroll.
    drawFigure(
      'white-eyes',
      hunter.x,
      hunter.y,
      hunter.facingX,
      hunter.facingY,
      hunter.moving,
      true,
      false,
    )
  }

  const player = drawFigure(
    'player',
    actor.x,
    actor.y,
    actor.facingX,
    actor.facingY,
    actor.moving,
    actor.running,
    true,
  )

  if (player !== undefined) revealPlayer(standing, player)

  standing.sort((a, b) => a.sort - b.sort)

  for (const item of standing) {
    ctx.globalAlpha = item.alpha
    ctx.drawImage(item.sprite, item.x, item.y)

    // Shaded faces get a second pass masked to the sprite, so only the wall
    // darkens and not the gap around it.
    if (item.shade !== undefined && item.shade > 0.002) {
      ctx.globalAlpha = item.alpha * item.shade
      ctx.globalCompositeOperation = 'source-atop'
      ctx.fillStyle = '#0a0c14'
      ctx.fillRect(item.x, item.y, item.sprite.width, item.sprite.height)
      ctx.globalCompositeOperation = 'source-over'
    }
  }

  ctx.globalAlpha = 1

  return lights
}

/** What to call the part of the cycle we are in. */
function phaseName(hour: number, darkness: number): string {
  if (darkness <= 0.01) return 'day'
  if (darkness >= 0.99) return 'night'
  return hour > 12 ? 'dusk' : 'dawn'
}

/**
 * The clock.
 *
 * Given a panel of its own rather than a place in the debug line, because it had a
 * place in the debug line and it was no use there — twelve-point grey, third item
 * along, indistinguishable from the tile coordinates beside it. A number nobody can
 * find is not a readout.
 *
 * The darkness bar is here for the same reason the clock is: the light level is the
 * thing being tuned, and reading it off the screen by eye is exactly what fails when
 * the screen is nearly black.
 */
function drawClock(
  ctx: CanvasRenderingContext2D,
  clock: Clock,
  darkness: number,
  width: number,
): void {
  const panelW = 132
  const panelH = 62
  const x = width - panelW - 10
  const y = 10

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(x, y, panelW, panelH)

  ctx.textBaseline = 'top'
  ctx.font = '22px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillStyle = '#f2f4f7'
  ctx.fillText(clock.label(), x + 12, y + 8)

  // Phase and speed on one line, so the panel says what the number means.
  const dayMinutes = clock.dayLength() / 60
  const speed = Math.abs(dayMinutes - 20) < 0.01 ? '' : ` · ${dayMinutes.toFixed(1)}m`

  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillStyle = clock.paused() ? '#ffd479' : '#9aa2ad'
  ctx.fillText(
    clock.paused() ? 'PAUSED' : `${phaseName(clock.hour(), darkness)}${speed}`,
    x + 12,
    y + 34,
  )

  // Darkness, drawn as a bar because the whole point is judging it at a glance.
  const barX = x + 12
  const barY = y + 50
  const barW = panelW - 24

  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)'
  ctx.fillRect(barX, barY, barW, 4)
  ctx.fillStyle = '#5f8dd6'
  ctx.fillRect(barX, barY, barW * darkness, 4)
}

export interface HudOptions {
  readonly actor: Actor
  readonly grid: Grid
  readonly clock: Clock
  readonly torch: boolean
  readonly zoom: number
  readonly width: number
  readonly darkness: number
  /** 2 draws everything, 1 the clock alone. 0 means this is not called at all. */
  readonly detail: number
}

/** Minimal on-screen readout. Replaced by a real HUD once there is something to report. */
export function drawHud(ctx: CanvasRenderingContext2D, options: HudOptions): void {
  const { actor, grid, clock, torch, zoom, width, darkness, detail } = options

  drawClock(ctx, clock, darkness, width)
  if (detail < 2) return

  const tileX = Math.floor(actor.x)
  const tileY = Math.floor(actor.y)
  const standingOn = grid.contains(tileX, tileY) ? tileDef(grid.at(tileX, tileY)).name : 'void'

  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.textBaseline = 'top'

  const lines = [
    'WASD walk · shift run · F torch · E power · tab bag · wheel zoom · [ ] speed · , . hour · \\ pause · H hide',
    `${String(tileX)}, ${String(tileY)}  ·  ${standingOn}  ·  ${zoom.toFixed(1)}x${torch ? '  ·  torch' : ''}`,
  ]

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fillRect(10, 10, 560, 8 + lines.length * 16)

  ctx.fillStyle = '#d6d9de'
  lines.forEach((line, i) => {
    ctx.fillText(line, 18, 16 + i * 16)
  })
}
