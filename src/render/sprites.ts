import { TILE_H, TILE_W } from '@/render/iso'
import type { TileSheet } from '@/render/textures'
import { Tile, type TileId } from '@/world/tiles'
import { ROOF_PIECED, WallStyle } from '@/world/buildings'
import { LampCondition, Prop, PROP_VARIANTS, type PropId } from '@/world/props'
import { Wall, WallSide, type WallId, type WallSideId } from '@/world/walls'

/**
 * Assembles the sprites the renderer draws with.
 *
 * Ground and wall art comes from loaded tile sheets (see `textures.ts`). The
 * character, and a fallback for any tile whose texture is missing, are still drawn
 * in code — so a failed or absent sheet degrades to something visible rather than a
 * hole in the world.
 *
 * Everything here is appearance, which is why it lives in `render/` and not beside
 * the definitions in `world/`. The simulation knows a wall is solid; only this file
 * knows it is brick.
 */

/** Number of distinct facings a character is drawn in. */
export const FACINGS = 8

/**
 * A wall spans one edge of a tile diamond — half its width — and stands a tile
 * tall above it. These match the dimensions the art ships at for 128×64 tiles.
 */
export const WALL_W = TILE_W / 2
export const WALL_H = 96

/**
 * The character is drawn against a 64-wide tile and scaled to whatever the tiles
 * actually are, so changing tile size does not silently leave them the wrong size
 * relative to the world.
 */
const PERSON_SCALE = TILE_W / 64

const PERSON_W = 40 * PERSON_SCALE
const PERSON_H = 56 * PERSON_SCALE
/** Where the character's feet sit inside their sprite, so it can be anchored. */
export const PERSON_ANCHOR = { x: PERSON_W / 2, y: 50 * PERSON_SCALE } as const

/**
 * Character animations.
 *
 * Frames run at a fixed rate per animation; the renderer picks one from elapsed
 * time. Structured as animation → direction → frames because that is exactly how
 * sprite sheets are laid out (a row per direction, a column per frame), so real art
 * drops in without reshaping anything.
 */
export const Animation = {
  Idle: 'idle',
  Walk: 'walk',
  Run: 'run',
} as const

export type AnimationId = (typeof Animation)[keyof typeof Animation]

export interface AnimationDef {
  readonly frames: number
  /** Seconds per frame. */
  readonly frameTime: number
}

export const ANIMATIONS: Readonly<Record<AnimationId, AnimationDef>> = {
  // All three sheets are 25 frames per direction. Frame *rate* is what separates
  // them: an idle breathes slowly, a run cycles over roughly twice a second.
  [Animation.Idle]: { frames: 25, frameTime: 0.09 },
  [Animation.Walk]: { frames: 25, frameTime: 0.045 },
  [Animation.Run]: { frames: 25, frameTime: 0.05 },
}

/** Directions per sheet row. Frames per row vary by animation — see ANIMATIONS. */
export const SHEET_ROWS = 8

/**
 * Sheets are built to their final size by `tools/build_character_sheets.py`, so no
 * scaling is applied at load. Kept as a constant because art from elsewhere will
 * arrive at whatever size it likes.
 */
export const CHARACTER_SCALE = 1

/**
 * Which sheet row holds each facing.
 *
 * Sheets are built by `tools/build_character_sheets.py` with a row per facing in
 * exactly the order {@link facingIndex} numbers them, so this is the identity. It
 * stays as a table because art from elsewhere will not follow that order, and one
 * line here beats translating inside the renderer.
 */
export const SHEET_ROW_FOR_FACING: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7]

/** Roof pieces for the Kenney roof, keyed by shape and orientation. */
export type RoofPieces = ReadonlyMap<string, HTMLCanvasElement>

/** Roof style id that draws from pieces rather than painted slabs. */
export const KENNEY_ROOF = ROOF_PIECED

export interface Sprites {
  /**
   * Ground tiles, indexed by tile id. Several variants per surface: a field of
   * one repeated tile reads as wallpaper no matter how good the texture is, and
   * that was doing more damage to the look of the world than the textures were.
   */
  readonly ground: ReadonlyMap<TileId, readonly HTMLCanvasElement[]>
  readonly roofPieces: RoofPieces
  /** Wall segments, keyed by {@link wallSpriteKey}. */
  readonly walls: ReadonlyMap<string, HTMLCanvasElement>
  /** Roof tiles, indexed by roof style. */
  readonly roofs: readonly HTMLCanvasElement[]
  /** Vegetation: species, then variant. */
  readonly props: ReadonlyMap<PropId, readonly HTMLCanvasElement[]>
  /** Characters by name, then animation → facing (see {@link facingIndex}) → frame. */
  readonly characters: ReadonlyMap<string, CharacterSheets>
}

/** Key for {@link Sprites.walls}. */
export function wallSpriteKey(wall: WallId, side: WallSideId, style: number): string {
  return `${String(wall)}:${String(side)}:${String(style)}`
}

/**
 * Roof colours, indexed by the style number an archetype carries.
 *
 * Index 0 is unused — a tile with roof style 0 has open sky above it. The rest are
 * deliberately distinct so a district reads at a glance from above: warm tiles over
 * housing, flat grey and green over commerce and industry.
 */
const ROOF_COLOURS: readonly string[] = [
  '#000000',
  '#8a4b3a',
  '#a2503f',
  '#4d5a68',
  '#5c6675',
  '#4a5750',
  '#6b6152',
  /** Weathered aluminium: trailers and garages. */
  '#83878b',
  /** Oxblood barn iron. */
  '#74423a',
]

interface Palette {
  readonly base: string
  readonly edge: string
  readonly speck?: string
}

const GROUND_PALETTES: ReadonlyMap<TileId, Palette> = new Map([
  [Tile.Grass, { base: '#4c7a42', edge: '#41693a', speck: '#5d8f4f' }],
  [Tile.Road, { base: '#3c3c42', edge: '#34343a' }],
  [Tile.Sidewalk, { base: '#8d8d88', edge: '#7c7c78' }],
  [Tile.Floorboards, { base: '#7a6248', edge: '#6b553e' }],
  [Tile.Tiles, { base: '#8f8f8a', edge: '#7d7d79' }],
  [Tile.Concrete, { base: '#6e6e6b', edge: '#5f5f5d' }],
  [Tile.Dirt, { base: '#7a6446', edge: '#68553b', speck: '#8c7554' }],
  [Tile.Rock, { base: '#6b6459', edge: '#5b554c' }],
  [Tile.Water, { base: '#1e3346', edge: '#182a3b' }],
  [Tile.Sand, { base: '#b3a077', edge: '#a08e69', speck: '#c2b18a' }],
  [Tile.Soil, { base: '#6d5138', edge: '#5d452f' }],
])

const WALL_TOP = '#b9ab95'
const WALL_LEFT = '#8d8272'
const WALL_RIGHT = '#a1957f'

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height

  const ctx = element.getContext('2d')
  if (ctx === null) throw new Error('2D canvas context unavailable')

  return [element, ctx]
}

/** Traces a tile diamond whose top vertex is at (0, top). */
function diamondPath(ctx: CanvasRenderingContext2D, top: number): void {
  const halfW = TILE_W / 2
  const halfH = TILE_H / 2

  ctx.beginPath()
  ctx.moveTo(halfW, top)
  ctx.lineTo(TILE_W, top + halfH)
  ctx.lineTo(halfW, top + TILE_H)
  ctx.lineTo(0, top + halfH)
  ctx.closePath()
}

function drawGroundTile(palette: Palette): HTMLCanvasElement {
  const [element, ctx] = canvas(TILE_W, TILE_H)

  diamondPath(ctx, 0)
  ctx.fillStyle = palette.base
  ctx.fill()

  // A seam a shade darker than the fill. Without it a field of one tile type reads
  // as a flat colour and the grid becomes impossible to judge distances against.
  ctx.strokeStyle = palette.edge
  ctx.lineWidth = 1
  ctx.stroke()

  if (palette.speck !== undefined) {
    ctx.fillStyle = palette.speck
    // Fixed offsets rather than random, so every tile of a type is identical and
    // the map cannot shimmer between frames.
    const specks: readonly (readonly [number, number])[] = [
      [26, 12],
      [38, 18],
      [30, 22],
    ]
    for (const [x, y] of specks) {
      ctx.fillRect(x, y, 2, 1)
    }
  }

  return element
}

/**
 * Fallback wall, used only when a texture is missing.
 *
 * A wall face is a parallelogram: it follows the tile edge, which drops or rises by
 * half a tile height across its width, and extends straight up from there.
 */
function drawEdgeWall(side: WallSideId, opening: boolean): HTMLCanvasElement {
  const [element, ctx] = canvas(WALL_W, WALL_H)

  const rise = TILE_H / 2
  // A west wall runs down-left across the screen; a north wall runs down-right.
  const baseLeft = side === WallSide.West ? WALL_H : WALL_H - rise
  const baseRight = side === WallSide.West ? WALL_H - rise : WALL_H

  ctx.beginPath()
  ctx.moveTo(0, baseLeft)
  ctx.lineTo(WALL_W, baseRight)
  ctx.lineTo(WALL_W, baseRight - TILE_W / 2)
  ctx.lineTo(0, baseLeft - TILE_W / 2)
  ctx.closePath()

  ctx.fillStyle = side === WallSide.West ? WALL_LEFT : WALL_RIGHT
  ctx.fill()
  ctx.strokeStyle = WALL_TOP
  ctx.lineWidth = 1
  ctx.stroke()

  if (opening) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillRect(WALL_W * 0.25, WALL_H * 0.35, WALL_W * 0.5, WALL_H * 0.25)
    ctx.globalCompositeOperation = 'source-over'
  }

  return element
}

/** Vertical pixels each step of roof rise adds. */
export const ROOF_STEP = 12

/**
 * A roof tile: a diamond with a skirt hanging below it.
 *
 * Roofs are hipped, so neighbouring tiles sit at different heights. Drawing bare
 * diamonds would leave the ground showing through the steps between them; the
 * skirt fills that gap, and since adjacent tiles never differ by more than one
 * step, a skirt one step deep is always enough.
 *
 * The result reads as a tiled roof with courses rather than a smooth slope, which
 * suits the rest of the art better than a perfectly even surface would.
 */
function drawRoof(colour: string): HTMLCanvasElement {
  const [element, ctx] = canvas(TILE_W, TILE_H + ROOF_STEP)

  const halfW = TILE_W / 2
  const halfH = TILE_H / 2

  // Skirt: the two faces below the diamond's lower edges.
  ctx.beginPath()
  ctx.moveTo(0, halfH)
  ctx.lineTo(halfW, TILE_H)
  ctx.lineTo(TILE_W, halfH)
  ctx.lineTo(TILE_W, halfH + ROOF_STEP)
  ctx.lineTo(halfW, TILE_H + ROOF_STEP)
  ctx.lineTo(0, halfH + ROOF_STEP)
  ctx.closePath()
  ctx.fillStyle = shade(colour, -0.32)
  ctx.fill()

  diamondPath(ctx, 0)
  ctx.fillStyle = colour
  ctx.fill()

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)'
  ctx.lineWidth = 1
  ctx.stroke()

  return element
}

/** Shifts a hex colour toward white (positive amount) or black (negative). */
function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  const channel = (shift: number): number => {
    const base = (value >> shift) & 0xff
    const target = amount > 0 ? 255 : 0
    return Math.round(base + (target - base) * Math.abs(amount))
  }
  return `rgb(${String(channel(16))}, ${String(channel(8))}, ${String(channel(0))})`
}

/**
 * Asphalt, drawn rather than sourced.
 *
 * Neither the floor nor the overworld pack contains a road surface — both lean
 * natural and fantasy — and substituting gravel or cobble read as a garden path,
 * while mixing several stone tiles for variety turned the roads into confetti.
 *
 * Speckle is seeded from the variant index, so the variants differ from each other
 * but each is identical every time it is drawn.
 */
function drawAsphalt(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(TILE_W, TILE_H)

  diamondPath(ctx, 0)
  ctx.save()
  ctx.clip()

  ctx.fillStyle = '#41434a'
  ctx.fillRect(0, 0, TILE_W, TILE_H)

  // Aggregate: fine light and dark grit, which is most of what reads as tarmac.
  let seed = 0x9e3779b9 ^ Math.imul(variant + 1, 0x85ebca6b)
  const random = (): number => {
    seed = Math.imul(seed ^ (seed >>> 15), 0x2545f491)
    return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296
  }

  for (let i = 0; i < 340; i++) {
    const x = random() * TILE_W
    const y = random() * TILE_H
    const light = random()
    ctx.fillStyle =
      light > 0.72
        ? 'rgba(180, 182, 190, 0.30)'
        : light > 0.4
          ? 'rgba(30, 31, 36, 0.38)'
          : 'rgba(96, 99, 108, 0.25)'
    ctx.fillRect(x, y, 1, 1)
  }

  ctx.restore()

  // A seam a shade darker, so the road still reads as laid rather than poured.
  diamondPath(ctx, 0)
  ctx.strokeStyle = 'rgba(20, 21, 25, 0.35)'
  ctx.lineWidth = 1
  ctx.stroke()

  return element
}

/**
 * Every prop is drawn into the same frame with the same anchor, whatever its
 * species. A sagebrush simply occupies the bottom of it. One size means the
 * renderer needs no per-species offsets and nothing can be anchored wrongly.
 */
export const PROP_W = 116
export const PROP_H = 168
export const PROP_ANCHOR = { x: PROP_W / 2, y: PROP_H - 6 } as const

/**
 * Vegetation, drawn rather than sourced.
 *
 * The palette is deliberately drained — olive, khaki, grey-green, dust — and never
 * a saturated green. A healthy green canopy reads as parkland, and this is not
 * meant to be parkland. Light comes from the upper left to match the wall art.
 */
function seededRandom(salt: number): () => number {
  let seed = 0x2545f491 ^ Math.imul(salt + 1, 0x9e3779b9)
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 0x2545f491)
    return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296
  }
}

function groundShadow(
  ctx: CanvasRenderingContext2D,
  radiusX: number,
  alpha: number,
  // Wide furniture frames centre elsewhere than the shared prop frame does.
  cx: number = PROP_ANCHOR.x,
): void {
  ctx.beginPath()
  ctx.ellipse(cx, PROP_ANCHOR.y, radiusX, radiusX * 0.42, 0, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(0, 0, 0, ${String(alpha)})`
  ctx.fill()
}

/** A tapering trunk, leaning slightly so no two stand identically. */
function trunk(
  ctx: CanvasRenderingContext2D,
  height: number,
  lean: number,
  width: number,
  colour: string,
  shadeColour: string,
): void {
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  ctx.beginPath()
  ctx.moveTo(cx - width, groundY)
  ctx.lineTo(cx + width, groundY)
  ctx.lineTo(cx + width * 0.55 + lean, groundY - height)
  ctx.lineTo(cx - width * 0.55 + lean, groundY - height)
  ctx.closePath()
  ctx.fillStyle = colour
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(cx, groundY)
  ctx.lineTo(cx + width, groundY)
  ctx.lineTo(cx + width * 0.55 + lean, groundY - height)
  ctx.lineTo(cx + lean, groundY - height)
  ctx.closePath()
  ctx.fillStyle = shadeColour
  ctx.fill()
}

/** Bare branching, used by the dead trees and under the willows. */
function branches(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  angle: number,
  length: number,
  depth: number,
  random: () => number,
  colour: string,
): void {
  if (depth === 0 || length < 5) return

  const toX = fromX + Math.cos(angle) * length
  const toY = fromY + Math.sin(angle) * length

  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
  ctx.strokeStyle = colour
  ctx.lineWidth = Math.max(1, depth * 1.4)
  ctx.lineCap = 'round'
  ctx.stroke()

  const spread = 0.45 + random() * 0.5
  branches(
    ctx,
    toX,
    toY,
    angle - spread,
    length * (0.62 + random() * 0.16),
    depth - 1,
    random,
    colour,
  )
  branches(
    ctx,
    toX,
    toY,
    angle + spread,
    length * (0.62 + random() * 0.16),
    depth - 1,
    random,
    colour,
  )
  if (random() > 0.55) {
    branches(
      ctx,
      toX,
      toY,
      angle + (random() - 0.5) * 0.4,
      length * 0.55,
      depth - 1,
      random,
      colour,
    )
  }
}

function drawDeadTree(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(PROP_W, PROP_H)
  const random = seededRandom(variant * 7 + 1)
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  groundShadow(ctx, 18, 0.24)

  const height = 62 + random() * 22
  const lean = (random() - 0.5) * 12
  trunk(ctx, height, lean, 6, '#4b453c', '#3a352e')

  // No canopy at all — the silhouette is the whole point of a dead tree.
  branches(
    ctx,
    cx + lean,
    groundY - height,
    -Math.PI / 2 + (random() - 0.5) * 0.3,
    30 + random() * 12,
    4,
    random,
    '#4b453c',
  )

  return element
}

function drawWillow(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(PROP_W, PROP_H)
  const random = seededRandom(variant * 13 + 5)
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  groundShadow(ctx, 26, 0.26)

  const height = 54 + random() * 14
  const lean = (random() - 0.5) * 8
  trunk(ctx, height, lean, 7, '#463c31', '#382f27')

  // Fronds hanging from a high crown, drawn as tapering strokes rather than
  // blobs: the drooping line is what makes a willow legible at this size.
  const crownX = cx + lean
  const crownY = groundY - height - 6
  const hue = 68 + random() * 14

  for (let i = 0; i < 26; i++) {
    const spread = (random() - 0.5) * 74
    const drop = 34 + random() * 46
    ctx.beginPath()
    ctx.moveTo(crownX + spread * 0.35, crownY)
    ctx.quadraticCurveTo(crownX + spread * 0.8, crownY + drop * 0.4, crownX + spread, crownY + drop)
    ctx.strokeStyle = `hsl(${String(hue)}, ${String(14 + random() * 10)}%, ${String(22 + random() * 12)}%)`
    ctx.lineWidth = 1 + random() * 1.6
    ctx.stroke()
  }

  return element
}

function drawPine(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(PROP_W, PROP_H)
  const random = seededRandom(variant * 17 + 3)
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  groundShadow(ctx, 20, 0.28)

  const height = 92 + random() * 30
  trunk(ctx, height * 0.34, 0, 5, '#3d332a', '#2f281f')

  // Stacked tiers, widest at the base, each slightly darker below.
  const hue = 96 + random() * 16
  const tiers = 5
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1)
    const y = groundY - height * (0.28 + t * 0.66)
    const halfWidth = 34 * (1 - t * 0.72) + 4

    ctx.beginPath()
    ctx.moveTo(cx, y - 26)
    ctx.lineTo(cx + halfWidth, y + 8)
    ctx.lineTo(cx - halfWidth, y + 8)
    ctx.closePath()
    ctx.fillStyle = `hsl(${String(hue)}, ${String(16 + t * 6)}%, ${String(13 + t * 7)}%)`
    ctx.fill()
  }

  return element
}

function drawTree(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(PROP_W, PROP_H)
  const random = seededRandom(variant * 23 + 11)
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  groundShadow(ctx, 24, 0.26)

  const height = 58 + random() * 18
  const lean = (random() - 0.5) * 10
  trunk(ctx, height, lean, 6, '#483e33', '#3a3229')

  // Sparse canopy: clumps with gaps between them, so the branches show through
  // and it reads as thinning rather than lush.
  const canopyY = groundY - height - 22 + random() * 8
  const hue = 62 + random() * 22
  const clumps: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + random() * 0.8
    const distance = 26 * (0.4 + random() * 0.6)
    clumps.push({
      x: cx + lean + Math.cos(angle) * distance,
      y: canopyY + Math.sin(angle) * distance * 0.6,
      r: 15 + random() * 11,
    })
  }

  for (const c of clumps) {
    ctx.beginPath()
    ctx.ellipse(c.x, c.y, c.r, c.r * 0.78, 0, 0, Math.PI * 2)
    ctx.fillStyle = `hsl(${String(hue)}, 16%, 17%)`
    ctx.fill()
  }
  for (const c of clumps) {
    ctx.beginPath()
    ctx.ellipse(c.x - c.r * 0.24, c.y - c.r * 0.3, c.r * 0.6, c.r * 0.48, 0, 0, Math.PI * 2)
    ctx.fillStyle = `hsl(${String(hue - 4)}, 18%, 26%)`
    ctx.fill()
  }

  return element
}

function drawSagebrush(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(PROP_W, PROP_H)
  const random = seededRandom(variant * 31 + 7)
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  groundShadow(ctx, 15, 0.2)

  // Spindly grey-green stems fanning from a common base, not a rounded bush.
  for (let i = 0; i < 16; i++) {
    const angle = -Math.PI / 2 + (random() - 0.5) * 1.9
    const length = 12 + random() * 20
    ctx.beginPath()
    ctx.moveTo(cx + (random() - 0.5) * 10, groundY)
    ctx.lineTo(cx + Math.cos(angle) * length * 1.4, groundY + Math.sin(angle) * length)
    ctx.strokeStyle = `hsl(${String(72 + random() * 16)}, ${String(10 + random() * 8)}%, ${String(30 + random() * 14)}%)`
    ctx.lineWidth = 1 + random()
    ctx.stroke()
  }

  return element
}

function drawScrub(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(PROP_W, PROP_H)
  const random = seededRandom(variant * 37 + 13)
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  groundShadow(ctx, 17, 0.2)

  const hue = 48 + random() * 20
  for (let i = 0; i < 4; i++) {
    const x = cx + (random() - 0.5) * 30
    const y = groundY - 8 - random() * 8
    const r = 10 + random() * 7
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2)
    ctx.fillStyle = `hsl(${String(hue)}, ${String(14 + random() * 8)}%, ${String(20 + random() * 10)}%)`
    ctx.fill()
  }

  return element
}

/**
 * A street lamp: a post with a head that overhangs slightly.
 *
 * Drawn tall enough to read against three-storey buildings without competing with
 * them. The lit glass is drawn bright regardless of time of day — the lighting
 * pass darkens everything around it, so a lamp that dimmed with the rest would
 * never look switched on.
 */
function drawLampPost(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(PROP_W, PROP_H)
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  groundShadow(ctx, 9, 0.22)

  const height = 96
  const reach = 16

  ctx.strokeStyle = '#31353c'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, groundY)
  ctx.lineTo(cx, groundY - height)
  ctx.quadraticCurveTo(cx, groundY - height - 12, cx + reach, groundY - height - 12)
  ctx.stroke()

  // Base, so it does not look pushed into the pavement like a pin.
  ctx.fillStyle = '#2a2e34'
  ctx.beginPath()
  ctx.ellipse(cx, groundY - 2, 7, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // Head and glass.
  ctx.fillStyle = '#2a2e34'
  ctx.beginPath()
  ctx.roundRect(cx + reach - 9, groundY - height - 16, 18, 8, 2)
  ctx.fill()

  // Unlit glass. Nothing in this world is energised on its own, so a lamp is dark
  // until the player pays for it; only its condition shows, not its power.
  ctx.fillStyle =
    variant === LampCondition.Broken
      ? '#2f333a'
      : variant === LampCondition.Damaged
        ? '#4b4f57'
        : '#5a5f68'
  ctx.beginPath()
  ctx.ellipse(cx + reach, groundY - height - 7, 6.5, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()

  return element
}

/**
 * A painted interior wall course: smooth plaster over a skirting board.
 *
 * Deliberately quiet. An interior wall's job is to be a calm surface the
 * furniture stands against — the moment it has texture it competes, which is
 * exactly what was wrong with the stone it replaces.
 */
function drawPaintedWall(side: WallSideId): HTMLCanvasElement {
  const [element, ctx] = canvas(WALL_W, WALL_H)

  const rise = TILE_H / 2
  const baseLeft = side === WallSide.West ? WALL_H : WALL_H - rise
  const baseRight = side === WallSide.West ? WALL_H - rise : WALL_H
  const top = TILE_W / 2

  const face = (): void => {
    ctx.beginPath()
    ctx.moveTo(0, baseLeft)
    ctx.lineTo(WALL_W, baseRight)
    ctx.lineTo(WALL_W, baseRight - top)
    ctx.lineTo(0, baseLeft - top)
    ctx.closePath()
  }

  // The two facings take different light, like every other wall in the packs.
  const paint = ctx.createLinearGradient(0, 0, 0, WALL_H)
  if (side === WallSide.West) {
    paint.addColorStop(0, '#8f887b')
    paint.addColorStop(1, '#7c7568')
  } else {
    paint.addColorStop(0, '#a29a8c')
    paint.addColorStop(1, '#8d8578')
  }
  face()
  ctx.fillStyle = paint
  ctx.fill()

  // Skirting board along the floor line, slightly deeper than the wall colour.
  ctx.strokeStyle = side === WallSide.West ? '#5b544a' : '#675f54'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(0, baseLeft - 3)
  ctx.lineTo(WALL_W, baseRight - 3)
  ctx.stroke()

  // A hairline of shadow at the ceiling edge, so the course ends deliberately.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, baseLeft - top + 1)
  ctx.lineTo(WALL_W, baseRight - top + 1)
  ctx.stroke()

  // Faint wear: a handful of scuffs low on the wall. A lived-in house, left.
  ctx.strokeStyle = 'rgba(60, 54, 46, 0.12)'
  ctx.lineWidth = 1
  for (const at of [0.22, 0.55, 0.8]) {
    const x = WALL_W * at
    const base = baseLeft + (baseRight - baseLeft) * at
    ctx.beginPath()
    ctx.moveTo(x - 6, base - 14)
    ctx.lineTo(x + 5, base - 11)
    ctx.stroke()
  }

  return element
}

/**
 * A low post-and-rail fence filling a wall slot.
 *
 * Same parallelogram geometry as the placeholder wall, but only the bottom
 * quarter is used — the rest of the course stays transparent, which is what makes
 * it read as a fence rather than a wall. Weathered grey: nobody has painted
 * anything here for years.
 */
function drawFence(side: WallSideId): HTMLCanvasElement {
  const [element, ctx] = canvas(WALL_W, WALL_H)

  const rise = TILE_H / 2
  const baseLeft = side === WallSide.West ? WALL_H : WALL_H - rise
  const baseRight = side === WallSide.West ? WALL_H - rise : WALL_H

  const height = 26
  const posts = 4

  const wood = side === WallSide.West ? '#6e675c' : '#7b746a'
  const dark = '#57514a'

  // Rails first, so posts overlap them.
  ctx.strokeStyle = wood
  ctx.lineWidth = 3
  for (const at of [0.45, 0.8]) {
    ctx.beginPath()
    ctx.moveTo(2, baseLeft - height * at)
    ctx.lineTo(WALL_W - 2, baseRight - height * at)
    ctx.stroke()
  }

  ctx.fillStyle = dark
  for (let i = 0; i < posts; i++) {
    const t = (i + 0.5) / posts
    const x = t * WALL_W
    const base = baseLeft + (baseRight - baseLeft) * t
    ctx.fillRect(x - 2, base - height, 4, height)
  }

  return element
}

/**
 * A dead car.
 *
 * Drawn as three stacked iso boxes — body, cabin, and the dark band of the
 * windows — because at this scale silhouette is everything and detail is noise.
 * Variant selects orientation to match the road it sits on, then paint; every
 * colour is faded and half of them are simply rust.
 */
function drawCarWreck(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(PROP_W, PROP_H)
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  const alongX = variant % 2 === 0
  const paints = ['#6d5a4a', '#5a6066', '#5d6b5e', '#6b5548', '#4f5a68']
  const paint = paints[Math.floor(variant / 2) % paints.length] ?? '#6d5a4a'

  groundShadow(ctx, 26, 0.3)

  // Unit vectors of the two iso axes: the long axis follows the road.
  const [lx, ly] = alongX ? [1, 0.5] : [-1, 0.5]
  const [wx, wy] = alongX ? [-1, 0.5] : [1, 0.5]

  const long = 26
  const wide = 12

  const box = (
    h0: number,
    h1: number,
    l0: number,
    l1: number,
    w0: number,
    w1: number,
    fill: string,
    shade: string,
  ): void => {
    // Top face of a box between fractional extents of the footprint.
    const at = (l: number, w: number, h: number): [number, number] => [
      cx + lx * l * long + wx * w * wide,
      groundY - h + (ly * l * long + wy * w * wide) * 0.9,
    ]
    const top: readonly (readonly [number, number])[] = [
      [l0, w0],
      [l1, w0],
      [l1, w1],
      [l0, w1],
    ]
    ctx.fillStyle = fill
    ctx.beginPath()
    top.forEach(([l, w], i) => {
      const [px, py] = at(l, w, h1)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.closePath()
    ctx.fill()

    // The two visible sides, darker.
    ctx.fillStyle = shade
    for (const [[la, wa], [lb, wb]] of [
      [
        [l0, w1],
        [l1, w1],
      ],
      [
        [l1, w0],
        [l1, w1],
      ],
    ] as const) {
      ctx.beginPath()
      const [ax, ay] = at(la, wa, h1)
      const [bx, by] = at(lb, wb, h1)
      const [cxx, cy] = at(lb, wb, h0)
      const [dx, dy] = at(la, wa, h0)
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.lineTo(cxx, cy)
      ctx.lineTo(dx, dy)
      ctx.closePath()
      ctx.fill()
    }
  }

  const darken = (hex: string, f: number): string => {
    const n = parseInt(hex.slice(1), 16)
    const c = (s: number) => Math.round(((n >> s) & 0xff) * f)
    return `rgb(${String(c(16))}, ${String(c(8))}, ${String(c(0))})`
  }

  // Body sits just off the ground — the tyres are long gone.
  box(2, 12, -1, 1, -1, 1, paint, darken(paint, 0.62))
  // Cabin, set back from the nose.
  box(12, 20, -0.55, 0.7, -0.75, 0.75, darken(paint, 0.85), darken(paint, 0.5))
  // Window band.
  box(13, 18, -0.5, 0.62, -0.72, 0.72, '#20242b', '#181b21')

  // Rust bloom across everything, heavier low down.
  let seed = 0x7f4a7c15 ^ Math.imul(variant + 1, 0x9e3779b9)
  const random = (): number => {
    seed = Math.imul(seed ^ (seed >>> 15), 0x2545f491)
    return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296
  }
  ctx.fillStyle = 'rgba(96, 58, 34, 0.5)'
  for (let i = 0; i < 26; i++) {
    const px = cx + (random() - 0.5) * long * 2.1
    const py = groundY - 4 - random() * 16
    ctx.fillRect(px, py, 1 + random() * 2.5, 1 + random() * 2)
  }

  return element
}

/** A condenser unit: a squat ribbed box with a fan circle on top. */
function drawACUnit(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(PROP_W, PROP_H)
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  groundShadow(ctx, 10, 0.24)

  const grey = variant % 2 === 0 ? '#9aa0a4' : '#8b8f92'
  const w = 18
  const h = 15

  // Front and side faces of a small box.
  ctx.fillStyle = grey
  ctx.beginPath()
  ctx.moveTo(cx - w, groundY - 4 - h + w * 0.5)
  ctx.lineTo(cx, groundY - h)
  ctx.lineTo(cx, groundY)
  ctx.lineTo(cx - w, groundY - 4 + w * 0.5 - 2)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#767b7f'
  ctx.beginPath()
  ctx.moveTo(cx, groundY - h)
  ctx.lineTo(cx + w, groundY - 4 - h + w * 0.5)
  ctx.lineTo(cx + w, groundY - 4 + w * 0.5 - 2)
  ctx.lineTo(cx, groundY)
  ctx.closePath()
  ctx.fill()

  // Top with the fan.
  ctx.fillStyle = '#a8adb1'
  ctx.beginPath()
  ctx.moveTo(cx, groundY - h)
  ctx.lineTo(cx - w, groundY - 4 - h + w * 0.5)
  ctx.lineTo(cx, groundY - 8 - h + w)
  ctx.lineTo(cx + w, groundY - 4 - h + w * 0.5)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = '#5f6468'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(cx, groundY - h - 4 + w * 0.5, 9, 4.5, 0, 0, Math.PI * 2)
  ctx.stroke()

  // Vent ribs on the front face.
  ctx.strokeStyle = 'rgba(60, 64, 68, 0.6)'
  ctx.lineWidth = 1
  for (let i = 0; i < 4; i++) {
    const y0 = groundY - h + 3 + i * 3
    ctx.beginPath()
    ctx.moveTo(cx - w + 3, y0 + w * 0.5 - 4)
    ctx.lineTo(cx - 2, y0)
    ctx.stroke()
  }

  return element
}

/** Bare rock, half-buried. */
function drawBoulder(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(PROP_W, PROP_H)
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  let seed = 0x94d049bb ^ Math.imul(variant + 1, 0x85ebca6b)
  const random = (): number => {
    seed = Math.imul(seed ^ (seed >>> 15), 0x2545f491)
    return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296
  }

  const width = 14 + random() * 12
  const height = 10 + random() * 8

  groundShadow(ctx, width * 0.9, 0.26)

  // An irregular lump: a distorted ellipse of a handful of points.
  const points: [number, number][] = []
  const lobes = 7
  for (let i = 0; i < lobes; i++) {
    const angle = (i / lobes) * Math.PI * 2
    const r = 0.75 + random() * 0.35
    points.push([
      cx + Math.cos(angle) * width * r,
      groundY - height * 0.55 + Math.sin(angle) * height * r * 0.6,
    ])
  }

  ctx.fillStyle = variant % 2 === 0 ? '#6f6a60' : '#67645e'
  ctx.beginPath()
  points.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.closePath()
  ctx.fill()

  // Lit top-left, shaded lower-right: the same sun everything else claims.
  ctx.fillStyle = 'rgba(255, 244, 214, 0.16)'
  ctx.beginPath()
  ctx.ellipse(
    cx - width * 0.3,
    groundY - height * 0.75,
    width * 0.45,
    height * 0.35,
    -0.4,
    0,
    Math.PI * 2,
  )
  ctx.fill()
  ctx.fillStyle = 'rgba(20, 18, 14, 0.25)'
  ctx.beginPath()
  ctx.ellipse(
    cx + width * 0.35,
    groundY - height * 0.3,
    width * 0.4,
    height * 0.3,
    0.3,
    0,
    Math.PI * 2,
  )
  ctx.fill()

  return element
}

/** An airfield windsock on its pole, hanging slack. */
function drawWindsock(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(PROP_W, PROP_H)
  const cx = PROP_ANCHOR.x
  const groundY = PROP_ANCHOR.y

  groundShadow(ctx, 8, 0.2)

  const height = 88

  ctx.strokeStyle = '#4a4e55'
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, groundY)
  ctx.lineTo(cx, groundY - height)
  ctx.stroke()

  // The sock droops: no wind blows here yet, and a limp sock says so.
  const sag = variant % 2 === 0 ? 1 : -1
  ctx.fillStyle = '#a3492f'
  ctx.beginPath()
  ctx.moveTo(cx, groundY - height)
  ctx.quadraticCurveTo(cx + 12 * sag, groundY - height + 4, cx + 15 * sag, groundY - height + 26)
  ctx.lineTo(cx + 9 * sag, groundY - height + 27)
  ctx.quadraticCurveTo(cx + 5 * sag, groundY - height + 10, cx, groundY - height + 6)
  ctx.closePath()
  ctx.fill()

  // Faded band.
  ctx.fillStyle = 'rgba(226, 218, 202, 0.7)'
  ctx.beginPath()
  ctx.moveTo(cx + 10 * sag, groundY - height + 14)
  ctx.lineTo(cx + 13.5 * sag, groundY - height + 18)
  ctx.lineTo(cx + 12 * sag, groundY - height + 23)
  ctx.lineTo(cx + 8.5 * sag, groundY - height + 19)
  ctx.closePath()
  ctx.fill()

  return element
}

/**
 * Furniture.
 *
 * Every piece is stacked isometric boxes in muted paint, same as the car
 * wrecks: at this scale silhouette is everything and detail is noise. Variant
 * is facing — even variants run the long axis down-right on screen, odd ones
 * down-left — so a bed can lie along whichever wall the plan puts it against.
 *
 * All of it shares one small box-drawing space rather than sixteen private
 * geometries, which is what keeps sixteen painters from being sixteen bugs.
 */
interface BoxSpace {
  readonly ctx: CanvasRenderingContext2D
  readonly cx: number
  readonly gy: number
  /** Screen unit vectors: l runs the piece's long axis, w its width. */
  readonly lx: number
  readonly ly: number
  readonly wx: number
  readonly wy: number
}

function boxSpace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  gy: number,
  alongX: boolean,
): BoxSpace {
  return alongX
    ? { ctx, cx, gy, lx: 1, ly: 0.5, wx: -1, wy: 0.5 }
    : { ctx, cx, gy, lx: -1, ly: 0.5, wx: 1, wy: 0.5 }
}

function shadeOf(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (s: number): number => Math.round(((n >> s) & 0xff) * f)
  return `rgb(${String(c(16))}, ${String(c(8))}, ${String(c(0))})`
}

/** One box in the space: extents in px along each axis, heights in px. */
function isoBox(
  s: BoxSpace,
  l0: number,
  l1: number,
  w0: number,
  w1: number,
  h0: number,
  h1: number,
  paint: string,
): void {
  const { ctx } = s
  const at = (l: number, w: number, h: number): [number, number] => [
    s.cx + s.lx * l + s.wx * w,
    s.gy - h + (s.ly * l + s.wy * w) * 0.9,
  ]

  const corners: readonly (readonly [number, number])[] = [
    [l0, w0],
    [l1, w0],
    [l1, w1],
    [l0, w1],
  ]

  ctx.fillStyle = paint
  ctx.beginPath()
  corners.forEach(([l, w], i) => {
    const [px, py] = at(l, w, h1)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.closePath()
  ctx.fill()

  for (const [[la, wa], [lb, wb], f] of [
    [[l0, w1], [l1, w1], 0.62],
    [[l1, w0], [l1, w1], 0.48],
  ] as const) {
    ctx.fillStyle = shadeOf(paint, f)
    ctx.beginPath()
    const [ax, ay] = at(la, wa, h1)
    const [bx, by] = at(lb, wb, h1)
    const [cxx, cy] = at(lb, wb, h0)
    const [dx, dy] = at(la, wa, h0)
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.lineTo(cxx, cy)
    ctx.lineTo(dx, dy)
    ctx.closePath()
    ctx.fill()
  }
}

/** A furniture painter: wide pieces get a wider frame, anchored the same way. */
function furniture(
  wide: boolean,
  paint: (s: BoxSpace, variant: number) => void,
): (variant: number) => HTMLCanvasElement {
  return (variant: number): HTMLCanvasElement => {
    const w = wide ? 170 : PROP_W
    const [element, ctx] = canvas(w, PROP_H)
    const s = boxSpace(ctx, w / 2, PROP_H - 6, variant % 2 === 0)
    groundShadow(ctx, wide ? 30 : 16, 0.26, w / 2)
    paint(s, variant)
    return element
  }
}

const drawBed = furniture(true, (s) => {
  isoBox(s, -44, 44, -16, 16, 2, 12, '#6b5a49')
  // Mattress and blanket, then the pillow at the head end.
  isoBox(s, -42, 42, -14, 14, 12, 17, '#b8b2a4')
  isoBox(s, -42, 12, -14, 14, 12, 19, '#5f6b63')
  isoBox(s, 24, 40, -12, 12, 17, 22, '#cfc9bb')
  // Headboard, on the far end.
  isoBox(s, 42, 46, -16, 16, 0, 30, '#5c4c3d')
})

const drawWardrobe = furniture(false, (s) => {
  isoBox(s, -18, 18, -11, 11, 0, 46, '#6b5847')
  // Door split and handles.
  isoBox(s, -1, 1, -11.5, 11.5, 8, 44, '#4f4136')
})

const drawNightstand = furniture(false, (s) => {
  isoBox(s, -10, 10, -9, 9, 0, 14, '#6b5847')
  isoBox(s, -9, 9, -8, 8, 14, 16, '#7a6754')
})

const drawSofa = furniture(true, (s) => {
  isoBox(s, -34, 34, -13, 13, 2, 12, '#5d6157')
  // Back along the far side, arms at both ends.
  isoBox(s, -34, 34, 6, 13, 12, 26, '#535749')
  isoBox(s, -34, -26, -13, 13, 12, 20, '#535749')
  isoBox(s, 26, 34, -13, 13, 12, 20, '#535749')
  // Seat cushions.
  isoBox(s, -25, 0, -12, 5, 12, 15, '#6a6e60')
  isoBox(s, 1, 25, -12, 5, 12, 15, '#666a5c')
})

const drawCoffeeTable = furniture(false, (s) => {
  isoBox(s, -16, -14, -9, -7, 0, 10, '#4f4136')
  isoBox(s, 14, 16, -9, -7, 0, 10, '#4f4136')
  isoBox(s, -16, -14, 7, 9, 0, 10, '#4f4136')
  isoBox(s, 14, 16, 7, 9, 0, 10, '#4f4136')
  isoBox(s, -18, 18, -10, 10, 10, 13, '#6b5847')
})

const drawTelevision = furniture(false, (s) => {
  isoBox(s, -12, 12, -5, 5, 0, 8, '#3a3d42')
  isoBox(s, -20, 20, -3, 3, 8, 32, '#23262b')
  // The screen: a face of glass on the near side, off and faintly reflective.
  isoBox(s, -18, 18, 3, 3.5, 10, 30, '#31363e')
})

const drawBookshelf = furniture(false, (s) => {
  isoBox(s, -20, 20, -8, 8, 0, 42, '#5c4c3d')
  // Shelves of books, as strips of muted spines.
  for (const [h0, h1] of [
    [4, 12],
    [16, 24],
    [28, 36],
  ] as const) {
    isoBox(s, -18, 18, -6, 6, h0, h1, '#4a3e32')
    for (let i = 0; i < 6; i++) {
      const l = -16 + i * 5.5
      const paints = ['#71564a', '#5a6157', '#6a6355', '#57505e']
      isoBox(s, l, l + 4, -5, 5, h0, h1 - 1, paints[i % paints.length] ?? '#5a5148')
    }
  }
})

const drawFloorLamp = furniture(false, (s) => {
  const { ctx, cx, gy } = s
  ctx.fillStyle = '#3b3e44'
  ctx.beginPath()
  ctx.ellipse(cx, gy - 1, 8, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#4a4d53'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, gy - 2)
  ctx.lineTo(cx, gy - 58)
  ctx.stroke()
  // The shade: a truncated cone, paper-coloured — it will glow when fed.
  ctx.fillStyle = '#a99e86'
  ctx.beginPath()
  ctx.moveTo(cx - 12, gy - 58)
  ctx.lineTo(cx + 12, gy - 58)
  ctx.lineTo(cx + 8, gy - 74)
  ctx.lineTo(cx - 8, gy - 74)
  ctx.closePath()
  ctx.fill()
})

const drawFridge = furniture(false, (s) => {
  isoBox(s, -13, 13, -11, 11, 0, 44, '#a8aaa6')
  // Freezer seam and handle on the near face.
  isoBox(s, -13, 13, 10.6, 11, 30, 31, '#7e807c')
  isoBox(s, 8, 10, 10.8, 11.2, 33, 42, '#6f716d')
})

const drawStove = furniture(false, (s) => {
  isoBox(s, -13, 13, -11, 11, 0, 24, '#9b9d99')
  isoBox(s, -12, 12, -10, 10, 24, 26, '#3f4245')
  // Burners.
  const { ctx } = s
  ctx.fillStyle = '#2a2c2f'
  for (const [l, w] of [
    [-7, -4],
    [6, -4],
    [-7, 5],
    [6, 5],
  ] as const) {
    const px = s.cx + s.lx * l + s.wx * w
    const py = s.gy - 26 + (s.ly * l + s.wy * w) * 0.9
    ctx.beginPath()
    ctx.ellipse(px, py, 5, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }
})

const drawCounter = furniture(false, (s) => {
  isoBox(s, -15, 15, -11, 11, 0, 22, '#6b5847')
  isoBox(s, -16, 16, -12, 12, 22, 25, '#8d8579')
})

const drawSink = furniture(false, (s) => {
  isoBox(s, -15, 15, -11, 11, 0, 22, '#6b5847')
  isoBox(s, -16, 16, -12, 12, 22, 25, '#9a9c98')
  const { ctx } = s
  // The basin, sunk into the top, and a tap that will never run again.
  ctx.fillStyle = '#5e605c'
  ctx.beginPath()
  ctx.ellipse(s.cx, s.gy - 25, 9, 4.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#7e807c'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(s.cx + s.wx * 8, s.gy - 25 + s.wy * 8 * 0.9)
  ctx.lineTo(s.cx + s.wx * 8, s.gy - 34 + s.wy * 8 * 0.9)
  ctx.lineTo(s.cx + s.wx * 4, s.gy - 33 + s.wy * 4 * 0.9)
  ctx.stroke()
})

const drawToilet = furniture(false, (s) => {
  // Tank against the far side, bowl in front.
  isoBox(s, -6, 6, 5, 10, 0, 26, '#b6b8b4')
  const { ctx } = s
  ctx.fillStyle = '#c2c4c0'
  ctx.beginPath()
  ctx.ellipse(s.cx + s.wx * -2, s.gy - 12 + s.wy * -2 * 0.9, 9, 5.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#8f918d'
  ctx.beginPath()
  ctx.ellipse(s.cx + s.wx * -2, s.gy - 13 + s.wy * -2 * 0.9, 6, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
})

const drawBath = furniture(true, (s) => {
  isoBox(s, -40, 40, -14, 14, 0, 14, '#b3b5b1')
  // The hollow: darker floor inside the rim.
  isoBox(s, -36, 36, -10, 10, 14, 14.5, '#878985')
})

const drawKitchenTable = furniture(false, (s) => {
  isoBox(s, -16, -14, -10, -8, 0, 16, '#4f4136')
  isoBox(s, 14, 16, -10, -8, 0, 16, '#4f4136')
  isoBox(s, -16, -14, 8, 10, 0, 16, '#4f4136')
  isoBox(s, 14, 16, 8, 10, 0, 16, '#4f4136')
  isoBox(s, -18, 18, -12, 12, 16, 19, '#6b5847')
})

const drawChair = furniture(false, (s) => {
  isoBox(s, -8, 8, -8, 8, 0, 11, '#5c4c3d')
  isoBox(s, -8, 8, 6, 8, 11, 26, '#544639')
})

const PROP_PAINTERS: Readonly<Record<PropId, (variant: number) => HTMLCanvasElement>> = {
  [Prop.None]: drawScrub,
  [Prop.DeadTree]: drawDeadTree,
  [Prop.Willow]: drawWillow,
  [Prop.Pine]: drawPine,
  [Prop.Tree]: drawTree,
  [Prop.Sagebrush]: drawSagebrush,
  [Prop.Scrub]: drawScrub,
  [Prop.LampPost]: drawLampPost,
  [Prop.CarWreck]: drawCarWreck,
  [Prop.AirConditioner]: drawACUnit,
  [Prop.Boulder]: drawBoulder,
  [Prop.Windsock]: drawWindsock,
  [Prop.Bed]: drawBed,
  [Prop.Wardrobe]: drawWardrobe,
  [Prop.Nightstand]: drawNightstand,
  [Prop.Sofa]: drawSofa,
  [Prop.CoffeeTable]: drawCoffeeTable,
  [Prop.Television]: drawTelevision,
  [Prop.Bookshelf]: drawBookshelf,
  [Prop.FloorLamp]: drawFloorLamp,
  [Prop.Fridge]: drawFridge,
  [Prop.Stove]: drawStove,
  [Prop.Counter]: drawCounter,
  [Prop.Sink]: drawSink,
  [Prop.Toilet]: drawToilet,
  [Prop.Bath]: drawBath,
  [Prop.KitchenTable]: drawKitchenTable,
  [Prop.Chair]: drawChair,
}

const SKIN = '#d7a67c'
const HAIR = '#3b2b21'
const SHIRT = '#4f6fa8'
const SHIRT_SHADE = '#415c8c'
const TROUSERS = '#39414f'
const SHOES = '#23262c'

/**
 * Draws the character facing a given screen direction.
 *
 * The figure is deliberately simple — a head, a torso, two legs — because
 * legibility at this size matters far more than detail. Facing is conveyed by
 * shifting the head slightly into the direction of travel and putting the hair on
 * whichever side is turned away, which reads clearly even at eight directions.
 */
function drawPerson(
  screenDirX: number,
  screenDirY: number,
  /** Position in the gait cycle, 0 to 1. */
  phase: number,
  /** How far the limbs swing. Running throws them further than walking. */
  swing: number,
): HTMLCanvasElement {
  const [element, ctx] = canvas(PERSON_W, PERSON_H)

  // Drawn once at the reference size and scaled by the transform, so the shapes
  // stay crisp instead of being upscaled after rasterising.
  ctx.scale(PERSON_SCALE, PERSON_SCALE)

  const cx = 20
  const feet = 50
  const facingCamera = screenDirY > 0.01
  const facingAway = screenDirY < -0.01

  // Contact shadow. Without it the character appears to hover above the ground.
  ctx.beginPath()
  ctx.ellipse(cx, feet, 9, 4.5, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
  ctx.fill()

  // Legs swing in opposition through the cycle, and the whole body dips slightly
  // at the point both feet are planted. Placeholder art, but the timing is what
  // real sprites will have to match, so it is worth getting the shape of it right.
  const cycle = Math.sin(phase * Math.PI * 2)
  const legLead = cycle * swing
  const bob = Math.abs(Math.cos(phase * Math.PI * 2)) * swing * 0.25

  ctx.save()
  ctx.translate(0, -bob)

  ctx.fillStyle = TROUSERS
  ctx.fillRect(cx - 5.5 + legLead, feet - 15 + bob, 5, 13 - bob)
  ctx.fillRect(cx + 0.5 - legLead, feet - 15 + bob, 5, 13 - bob)
  ctx.fillStyle = SHOES
  ctx.fillRect(cx - 5.5 + legLead, feet - 3, 5, 3)
  ctx.fillRect(cx + 0.5 - legLead, feet - 3, 5, 3)

  // Torso.
  const torsoTop = feet - 30
  ctx.fillStyle = SHIRT
  ctx.beginPath()
  ctx.roundRect(cx - 8, torsoTop, 16, 17, 4)
  ctx.fill()

  // Arms counter-swing against the legs, which is what stops a walk cycle reading
  // as a shuffle.
  ctx.fillStyle = SHIRT_SHADE
  ctx.beginPath()
  ctx.roundRect(cx - 10.5 - legLead * 0.6, torsoTop + 2, 4, 12, 2)
  ctx.roundRect(cx + 6.5 + legLead * 0.6, torsoTop + 2, 4, 12, 2)
  ctx.fill()

  // Head, nudged toward the facing direction so a turn is visible even standing still.
  const headX = cx + screenDirX * 1.8
  const headY = torsoTop - 6 + screenDirY * 0.8

  ctx.beginPath()
  ctx.arc(headX, headY, 7, 0, Math.PI * 2)
  ctx.fillStyle = SKIN
  ctx.fill()

  // Hair covers the side turned away from the viewer; a full cap when facing away.
  ctx.fillStyle = HAIR
  ctx.beginPath()
  if (facingAway) {
    ctx.arc(headX, headY, 7, 0, Math.PI * 2)
  } else {
    const centre = Math.atan2(-screenDirY, -screenDirX)
    ctx.arc(headX, headY, 7, centre - Math.PI / 2, centre + Math.PI / 2)
  }
  ctx.fill()

  if (facingCamera) {
    ctx.fillStyle = '#2a2320'
    ctx.fillRect(headX - 3.2 + screenDirX, headY - 0.5, 1.8, 2)
    ctx.fillRect(headX + 1.4 + screenDirX, headY - 0.5, 1.8, 2)
  }

  ctx.restore()

  return element
}

/**
 * Maps a world-space facing to one of eight sprite indices.
 *
 * The facing is projected to screen space first, so the eight sprites are spaced
 * evenly as they appear on screen rather than evenly in world coordinates — which
 * would bunch them up, since the projection squashes the vertical axis.
 */
export function facingIndex(facingX: number, facingY: number): number {
  const screenX = facingX - facingY
  const screenY = (facingX + facingY) / 2

  const angle = Math.atan2(screenY, screenX)
  const step = (Math.PI * 2) / FACINGS

  return ((Math.round(angle / step) % FACINGS) + FACINGS) % FACINGS
}

/**
 * Which sheet and which tile within it each ground type uses.
 *
 * This mapping is the whole reason `world/` never learned what a road looks like:
 * changing the city's surfaces is an edit to this table, not to the simulation.
 */
interface TextureRef {
  readonly sheet: string
  /** Tiles within the sheet to cycle between, so a surface is not uniform. */
  readonly indices: readonly number[]
}

/**
 * Which material out of the twelve on each wall sheet the buildings use.
 *
 * Wall sheets are laid out in **pairs**: each material occupies two adjacent cells
 * holding the same brick at opposite slopes — one rising left-to-right, one falling.
 * A west wall runs down-left across the screen and needs the rising cell; a north
 * wall runs down-right and needs the falling one.
 *
 * Which of the two a given side needs is decided by {@link slopesLikeWestWall},
 * reading the art rather than trusting an order that differs between packs.
 *
 * The SE and SW sheets are *lighting* variants of the same geometry, not facings —
 * each side uses whichever is lit correctly for the way it faces.
 */
const WALL_MATERIAL = 0

const GROUND_TEXTURES: ReadonlyMap<TileId, TextureRef> = new Map([
  // Dense undergrowth from the overworld pack rather than mown lawn — it reads as
  // overgrown, which suits a world that has been left alone for a while.
  [Tile.Grass, { sheet: 'forest', indices: [0, 1, 2, 4, 7, 9, 10, 13] }],
  // Road has no entry: it is drawn by drawAsphalt below, because no pack here
  // has a road surface.
  [Tile.Sidewalk, { sheet: 'tile', indices: [2, 7, 2, 11] }],
  [Tile.Floorboards, { sheet: 'wood', indices: [0, 3, 6] }],
  [Tile.Tiles, { sheet: 'tile', indices: [7, 2, 11] }],
  [Tile.Concrete, { sheet: 'stone', indices: [15, 9, 17] }],
  // Both sheets were pulled with the rest of the terrain pack and had no use
  // while the map was only a town. Open country is what they were made for.
  [Tile.Dirt, { sheet: 'dry', indices: [0, 1, 2, 5, 8] }],
  [Tile.Rock, { sheet: 'rocky', indices: [0, 3, 6, 9] }],
  // Water and soil are drawn in code below, like the road: no pack here has
  // either, and a placeholder diamond reads as a bug rather than a surface.
  [Tile.Sand, { sheet: 'dry', indices: [3, 4, 6, 7] }],
])

/**
 * @param sheets loaded tile sheets; any tile without one falls back to the
 *   code-drawn placeholder, so a missing or failed texture degrades to something
 *   visible rather than a hole in the world.
 */

/**
 * Which way a wall tile slopes, read off the art itself.
 *
 * A west wall runs down-left across the screen, so its highest point is on the
 * right; a north wall runs down-right and is highest on the left. Comparing the
 * topmost opaque pixel at each edge tells them apart.
 *
 * Detected rather than assumed because the convention differs between packs, and
 * getting it wrong renders a building as a detached staircase — a failure that
 * looks like broken art rather than a wrong index, and has now cost two debugging
 * sessions.
 */
function slopesLikeWestWall(tile: HTMLCanvasElement): boolean {
  const ctx = tile.getContext('2d', { willReadFrequently: true })
  if (ctx === null) return true

  const topOpaque = (x: number): number => {
    const column = ctx.getImageData(x, 0, 1, tile.height).data
    for (let y = 0; y < tile.height; y++) {
      if ((column[y * 4 + 3] ?? 0) > 24) return y
    }
    return tile.height
  }

  const inset = Math.max(1, Math.floor(tile.width * 0.15))
  return topOpaque(tile.width - 1 - inset) < topOpaque(inset)
}

/**
 * Open water.
 *
 * Deliberately calm and dark — a dead sea to match a dead grid. The horizontal
 * strokes are what read as water at this scale; anything busier shimmers.
 */
function drawWater(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(TILE_W, TILE_H)

  diamondPath(ctx, 0)
  ctx.save()
  ctx.clip()

  ctx.fillStyle = '#1e3346'
  ctx.fillRect(0, 0, TILE_W, TILE_H)

  let seed = 0x51ed270b ^ Math.imul(variant + 1, 0x9e3779b9)
  const random = (): number => {
    seed = Math.imul(seed ^ (seed >>> 15), 0x2545f491)
    return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296
  }

  // A few long, faint swells.
  for (let i = 0; i < 5; i++) {
    const y = 4 + random() * (TILE_H - 8)
    const x = random() * TILE_W * 0.5
    const length = TILE_W * (0.2 + random() * 0.35)
    ctx.strokeStyle = random() > 0.5 ? 'rgba(150, 180, 205, 0.10)' : 'rgba(10, 18, 28, 0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + length, y + (random() - 0.5) * 2)
    ctx.stroke()
  }

  ctx.restore()
  return element
}

/**
 * Ploughed earth.
 *
 * The furrows run along one tile axis so a whole field shares a direction, which
 * is most of what makes it read as worked land rather than mud.
 */
function drawSoil(variant: number): HTMLCanvasElement {
  const [element, ctx] = canvas(TILE_W, TILE_H)

  diamondPath(ctx, 0)
  ctx.save()
  ctx.clip()

  ctx.fillStyle = '#6d5138'
  ctx.fillRect(0, 0, TILE_W, TILE_H)

  // Furrows are the line family x/W + y/H = c, which runs parallel to the tile's
  // top-right edge. Crossing into the neighbouring tile shifts c by exactly 1, so
  // with an even row count both the spacing and the light/dark alternation carry
  // straight across a field without a seam.
  const rows = 6
  for (let i = 0; i < rows; i++) {
    const c = 0.5 + (i + 0.5) / rows
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(40, 28, 17, 0.5)' : 'rgba(140, 110, 78, 0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-TILE_W, (c + 1) * TILE_H)
    ctx.lineTo(2 * TILE_W, (c - 2) * TILE_H)
    ctx.stroke()
  }

  let seed = 0x1b873593 ^ Math.imul(variant + 1, 0x85ebca6b)
  const random = (): number => {
    seed = Math.imul(seed ^ (seed >>> 15), 0x2545f491)
    return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(30, 20, 12, 0.3)' : 'rgba(150, 120, 85, 0.28)'
    ctx.fillRect(random() * TILE_W, random() * TILE_H, 1, 1)
  }

  ctx.restore()
  return element
}

/** One character's art: animation, then facing, then frame. */
export type CharacterSheets = ReadonlyMap<AnimationId, readonly (readonly HTMLCanvasElement[])[]>

export function buildSprites(
  sheets: ReadonlyMap<string, TileSheet>,
  loaded?: ReadonlyMap<string, CharacterSheets>,
  objects?: ReadonlyMap<string, HTMLCanvasElement>,
): Sprites {
  const ground = new Map<TileId, readonly HTMLCanvasElement[]>()

  for (const [id, palette] of GROUND_PALETTES) {
    const ref = GROUND_TEXTURES.get(id)
    const sheet = ref === undefined ? undefined : sheets.get(ref.sheet)

    const variants =
      ref === undefined || sheet === undefined
        ? []
        : ref.indices
            .map((i) => sheet.tiles[i])
            .filter((c): c is HTMLCanvasElement => c !== undefined)

    ground.set(id, variants.length > 0 ? variants : [drawGroundTile(palette)])
  }

  ground.set(Tile.Road, [0, 1, 2, 3].map(drawAsphalt))

  // Kenney floors, when present: the frame is 128x256 with the floor at the
  // bottom, so it is cropped to the diamond plus its thickness skirt. The
  // renderer bottom-aligns ground sprites, so the extra height just works.
  const kenneyFloor = (name: string): HTMLCanvasElement | undefined => {
    const frame = objects?.get(name)
    if (frame === undefined) return undefined
    const [element, ctx] = canvas(frame.width, 70)
    ctx.drawImage(frame, 0, frame.height - 70 - 6, frame.width, 70, 0, 0, frame.width, 70)
    return element
  }
  const planks = kenneyFloor('planks')
  const planksOld = kenneyFloor('planksOld')
  if (planks !== undefined && planksOld !== undefined) {
    ground.set(Tile.Floorboards, [planks, planks, planksOld])
    ground.set(Tile.Tiles, [planksOld, planks, planksOld])
  }

  // The flat plank roof. The pack's prism roof pieces are complete gable
  // cross-sections for buildings a few tiles deep — Kenney's own sample never
  // spans more than four — and tiling them over a nine-deep footprint stacks
  // prisms into nonsense. A raised plank deck is squarely in the pack's own
  // vocabulary, and it tiles to any size.
  const flatRoof = kenneyFloor('planksOld')
  ground.set(Tile.Water, [0, 1, 2, 3].map(drawWater))
  ground.set(Tile.Soil, [0, 1, 2].map(drawSoil))

  // Walls: one sprite per (kind, side, material). The art ships a separate render
  // for each facing rather than a mirror, because the coursing and lighting differ.
  const walls = new Map<string, HTMLCanvasElement>()

  const kinds: readonly (readonly [WallId, string])[] = [
    [Wall.Solid, ''],
    [Wall.Window, '-window'],
  ]

  // Where each wall style's art comes from. The first three are the plain wall
  // pack; the rest are building facades from the town pack — multi-storey fronts
  // with windows and shop frontage, which is what stops every building reading as
  // the same brick box.
  //
  // Facade sheets are one image rather than a pair, and like the wall pack they
  // store slopes in adjacent columns, so a style picks a *pair* and the side
  // chooses within it.
  const WALL_STYLE_SOURCES: readonly { sheet: string; pair: number; paired: boolean }[] = [
    { sheet: 'wall-brick', pair: 0, paired: true },
    { sheet: 'wall-stone', pair: 0, paired: true },
    { sheet: 'wall-wood', pair: 0, paired: true },
    { sheet: 'facade-1', pair: 0, paired: false },
    { sheet: 'facade-1', pair: 1, paired: false },
    { sheet: 'facade-1', pair: 3, paired: false },
    { sheet: 'facade-2', pair: 0, paired: false },
    { sheet: 'facade-2', pair: 2, paired: false },
    { sheet: 'facade-3', pair: 1, paired: false },
  ]

  WALL_STYLE_SOURCES.forEach((source, style) => {
    for (const [id, suffix] of kinds) {
      // Take the pair of tiles holding this material's two slopes, then let the
      // art decide which is which rather than assuming an order.
      const candidates = [WallSide.West, WallSide.North].map((side) => {
        const sheetName = source.paired
          ? `${source.sheet}${suffix}-${side === WallSide.West ? 'se' : 'sw'}`
          : source.sheet
        const index = source.paired
          ? WALL_MATERIAL * 2 + (side === WallSide.West ? 0 : 1)
          : source.pair * 2 + (side === WallSide.West ? 0 : 1)
        return sheets.get(sheetName)?.tiles[index]
      })

      const [first, second] = candidates
      let west = first
      let north = second

      if (first !== undefined && second !== undefined && !slopesLikeWestWall(first)) {
        west = second
        north = first
      }

      walls.set(
        wallSpriteKey(id, WallSide.West, style),
        west ?? drawEdgeWall(WallSide.West, id === Wall.Window),
      )
      walls.set(
        wallSpriteKey(id, WallSide.North, style),
        north ?? drawEdgeWall(WallSide.North, id === Wall.Window),
      )
    }
  })

  // The fence style has no sheet: it is drawn in code, one segment tall, and a
  // gate in it is a Doorway — which at that height draws nothing, leaving a gap.
  for (const side of [WallSide.West, WallSide.North] as const) {
    const fence = drawFence(side)
    walls.set(wallSpriteKey(Wall.Solid, side, WallStyle.Fence), fence)
    walls.set(wallSpriteKey(Wall.Window, side, WallStyle.Fence), fence)

    // Painted interiors likewise: glazing makes no sense in a partition, so the
    // window key reuses the solid course.
    const painted = drawPaintedWall(side)
    walls.set(wallSpriteKey(Wall.Solid, side, WallStyle.Painted), painted)
    walls.set(wallSpriteKey(Wall.Window, side, WallStyle.Painted), painted)
  }

  // Timber walls: whole Kenney frames, one storey of art per course, with
  // window and doorway variants that carry their opening in the drawing.
  if (objects !== undefined) {
    const timber: readonly (readonly [WallId, string])[] = [
      [Wall.Solid, 'woodWall'],
      [Wall.Window, 'woodWallWindowGlass'],
      [Wall.Doorway, 'woodWallDoorway'],
    ]
    for (const [kind, base] of timber) {
      const west = objects.get(`${base}_E`)
      const north = objects.get(`${base}_S`)
      if (west !== undefined) walls.set(wallSpriteKey(kind, WallSide.West, WallStyle.Timber), west)
      if (north !== undefined)
        walls.set(wallSpriteKey(kind, WallSide.North, WallStyle.Timber), north)
    }
  }

  // Roof pieces, keyed by what the tile's neighbourhood needs: a slope facing
  // its downhill direction, a corner for two adjacent downhills, a ridge cap
  // along an axis. Orientation mapping was measured off the art's alpha.
  const roofPieces = new Map<string, HTMLCanvasElement>()
  if (objects !== undefined) {
    const pieces: readonly (readonly [string, string])[] = [
      ['slope:+x', 'roof_N'],
      ['slope:+y', 'roof_E'],
      ['slope:-x', 'roof_S'],
      ['slope:-y', 'roof_W'],
      ['corner:+x+y', 'roofCorner_N'],
      ['corner:+y-x', 'roofCorner_E'],
      ['corner:-x-y', 'roofCorner_S'],
      ['corner:-y+x', 'roofCorner_W'],
      ['ridge:x', 'roofSingle_N'],
      ['ridge:y', 'roofSingle_E'],
    ]
    for (const [key, name] of pieces) {
      const sprite = objects.get(name)
      if (sprite !== undefined) roofPieces.set(key, sprite)
    }
    if (flatRoof !== undefined) roofPieces.set('flat', flatRoof)
  }

  const roofs = ROOF_COLOURS.map((colour) => drawRoof(colour))
  const props = new Map<PropId, readonly HTMLCanvasElement[]>()
  for (const [id, paint] of Object.entries(PROP_PAINTERS)) {
    const species = Number(id) as PropId
    if (species === Prop.None) continue
    props.set(
      species,
      Array.from({ length: PROP_VARIANTS }, (_, variant) => paint(variant)),
    )
  }

  // Furniture with real art replaces its code-drawn painter. Variant order is
  // facing: 0 fronts down-left (+y), 1 down-right (+x), 2 and 3 the backs.
  if (objects !== undefined) {
    const overrides: readonly (readonly [PropId, readonly string[]])[] = [
      [
        Prop.Bookshelf,
        ['bookcaseBooks_S', 'bookcaseBooks_E', 'bookcaseBooks_N', 'bookcaseBooks_W'],
      ],
      [Prop.Chair, ['libraryChair_S', 'libraryChair_E', 'libraryChair_N', 'libraryChair_W']],
      [Prop.KitchenTable, ['longTable_S', 'longTable_E']],
      [Prop.CoffeeTable, ['displayCase_S', 'displayCase_E']],
    ]
    for (const [id, names] of overrides) {
      const frames = names
        .map((name) => objects.get(name))
        .filter((c): c is HTMLCanvasElement => c !== undefined)
      if (frames.length > 0) props.set(id, frames)
    }
  }

  // One set of frames per animation per facing, per character. Anything without
  // art of its own falls back to the drawn placeholder, so a failed load leaves a
  // visible figure rather than nothing at all.
  const characters = new Map<string, CharacterSheets>()
  const step = (Math.PI * 2) / FACINGS

  const swings: Readonly<Record<AnimationId, number>> = {
    [Animation.Idle]: 0,
    [Animation.Walk]: 2.4,
    [Animation.Run]: 4.2,
  }

  const names = new Set(['player', ...(loaded?.keys() ?? [])])

  for (const name of names) {
    const supplied = loaded?.get(name)
    const character = new Map<AnimationId, readonly (readonly HTMLCanvasElement[])[]>()

    for (const id of [Animation.Idle, Animation.Walk, Animation.Run] as const) {
      const { frames } = ANIMATIONS[id]
      // An animation with no art of its own borrows idle's. A figure that stands
      // still while moving is odd; one that turns into somebody else is worse.
      const sheet = supplied?.get(id) ?? supplied?.get(Animation.Idle)

      const byFacing: HTMLCanvasElement[][] = []
      for (let facing = 0; facing < FACINGS; facing++) {
        const row = sheet?.[SHEET_ROW_FOR_FACING[facing] ?? 0]

        if (row !== undefined && row.length > 0) {
          byFacing.push([...row])
          continue
        }

        const angle = facing * step
        const cells: HTMLCanvasElement[] = []
        for (let frame = 0; frame < frames; frame++) {
          cells.push(drawPerson(Math.cos(angle), Math.sin(angle), frame / frames, swings[id]))
        }
        byFacing.push(cells)
      }

      character.set(id, byFacing)
    }

    characters.set(name, character)
  }

  return { ground, walls, roofs, roofPieces, props, characters }
}
