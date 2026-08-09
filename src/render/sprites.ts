import { TILE_H, TILE_W } from '@/render/iso'
import type { TileSheet } from '@/render/textures'
import { Tile, type TileId } from '@/world/tiles'
import { Prop, PROP_VARIANTS, type PropId } from '@/world/props'
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

export interface Sprites {
  /**
   * Ground tiles, indexed by tile id. Several variants per surface: a field of
   * one repeated tile reads as wallpaper no matter how good the texture is, and
   * that was doing more damage to the look of the world than the textures were.
   */
  readonly ground: ReadonlyMap<TileId, readonly HTMLCanvasElement[]>
  /** Wall segments, keyed by {@link wallSpriteKey}. */
  readonly walls: ReadonlyMap<string, HTMLCanvasElement>
  /** Roof tiles, indexed by roof style. */
  readonly roofs: readonly HTMLCanvasElement[]
  /** Vegetation: species, then variant. */
  readonly props: ReadonlyMap<PropId, readonly HTMLCanvasElement[]>
  /** The character: animation → facing (see {@link facingIndex}) → frame. */
  readonly character: ReadonlyMap<AnimationId, readonly (readonly HTMLCanvasElement[])[]>
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

function groundShadow(ctx: CanvasRenderingContext2D, radiusX: number, alpha: number): void {
  ctx.beginPath()
  ctx.ellipse(PROP_ANCHOR.x, PROP_ANCHOR.y, radiusX, radiusX * 0.42, 0, 0, Math.PI * 2)
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
  const random = seededRandom(variant * 41 + 17)
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

  const lit = random() > 0.18
  ctx.fillStyle = lit ? '#ffd9a0' : '#4a4f57'
  ctx.beginPath()
  ctx.ellipse(cx + reach, groundY - height - 7, 6.5, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()

  return element
}

const PROP_PAINTERS: Readonly<Record<PropId, (variant: number) => HTMLCanvasElement>> = {
  [Prop.None]: drawScrub,
  [Prop.DeadTree]: drawDeadTree,
  [Prop.Willow]: drawWillow,
  [Prop.Pine]: drawPine,
  [Prop.Tree]: drawTree,
  [Prop.Sagebrush]: drawSagebrush,
  [Prop.Scrub]: drawScrub,
  [Prop.LampPost]: drawLampPost,
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

export function buildSprites(
  sheets: ReadonlyMap<string, TileSheet>,
  characterSheets?: ReadonlyMap<AnimationId, readonly (readonly HTMLCanvasElement[])[]>,
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

  // One set of frames per animation per facing. Placeholder art, generated to the
  // same shape real sprite sheets arrive in, so swapping them is a change of source
  // rather than a change of structure.
  const character = new Map<AnimationId, readonly (readonly HTMLCanvasElement[])[]>()
  const step = (Math.PI * 2) / FACINGS

  const swings: Readonly<Record<AnimationId, number>> = {
    [Animation.Idle]: 0,
    [Animation.Walk]: 2.4,
    [Animation.Run]: 4.2,
  }

  for (const id of [Animation.Idle, Animation.Walk, Animation.Run] as const) {
    const { frames } = ANIMATIONS[id]
    // An animation with no art of its own borrows idle's. A character who stands
    // still while walking is odd; a character who turns into somebody else is
    // worse, and that is what falling straight through to the placeholder does.
    const sheet = characterSheets?.get(id) ?? characterSheets?.get(Animation.Idle)

    const byFacing: HTMLCanvasElement[][] = []
    for (let facing = 0; facing < FACINGS; facing++) {
      // Real art is stored by sheet row, so the facing has to be translated first.
      const row = sheet?.[SHEET_ROW_FOR_FACING[facing] ?? 0]

      if (row !== undefined && row.length > 0) {
        byFacing.push([...row])
        continue
      }

      // No sheet: fall back to the drawn placeholder, so a missing or failed load
      // leaves a visible character rather than nothing at all.
      const angle = facing * step
      const cells: HTMLCanvasElement[] = []
      for (let frame = 0; frame < frames; frame++) {
        cells.push(drawPerson(Math.cos(angle), Math.sin(angle), frame / frames, swings[id]))
      }
      byFacing.push(cells)
    }

    character.set(id, byFacing)
  }

  return { ground, walls, roofs, props, character }
}
