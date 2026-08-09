import { TILE_H, TILE_W } from '@/render/iso'
import type { TileSheet } from '@/render/textures'
import { Tile, type TileId } from '@/world/tiles'
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

export interface Sprites {
  /** Ground tiles, indexed by tile id. */
  readonly ground: ReadonlyMap<TileId, HTMLCanvasElement>
  /** Wall segments, keyed by `${wallId}:${side}`. */
  readonly walls: ReadonlyMap<string, HTMLCanvasElement>
  /** The character, indexed by facing (see {@link facingIndex}). */
  readonly person: readonly HTMLCanvasElement[]
}

/** Key for {@link Sprites.walls}. */
export function wallSpriteKey(wall: WallId, side: WallSideId): string {
  return `${String(wall)}:${String(side)}`
}

interface Palette {
  readonly base: string
  readonly edge: string
  readonly speck?: string
}

const GROUND_PALETTES: ReadonlyMap<TileId, Palette> = new Map([
  [Tile.Grass, { base: '#4c7a42', edge: '#41693a', speck: '#5d8f4f' }],
  [Tile.Road, { base: '#3c3c42', edge: '#34343a' }],
  [Tile.Sidewalk, { base: '#8d8d88', edge: '#7c7c78' }],
  [Tile.Floor, { base: '#7a6248', edge: '#6b553e' }],
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
function drawPerson(screenDirX: number, screenDirY: number): HTMLCanvasElement {
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

  // Legs and shoes.
  ctx.fillStyle = TROUSERS
  ctx.fillRect(cx - 5.5, feet - 15, 5, 13)
  ctx.fillRect(cx + 0.5, feet - 15, 5, 13)
  ctx.fillStyle = SHOES
  ctx.fillRect(cx - 5.5, feet - 3, 5, 3)
  ctx.fillRect(cx + 0.5, feet - 3, 5, 3)

  // Torso.
  const torsoTop = feet - 30
  ctx.fillStyle = SHIRT
  ctx.beginPath()
  ctx.roundRect(cx - 8, torsoTop, 16, 17, 4)
  ctx.fill()

  // Arms, tucked slightly behind the torso silhouette.
  ctx.fillStyle = SHIRT_SHADE
  ctx.beginPath()
  ctx.roundRect(cx - 10.5, torsoTop + 2, 4, 12, 2)
  ctx.roundRect(cx + 6.5, torsoTop + 2, 4, 12, 2)
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
  readonly index: number
}

/**
 * Which material out of the twelve on each wall sheet the buildings use.
 *
 * Wall sheets are laid out in **pairs**: each material occupies two adjacent cells
 * holding the same brick at opposite slopes — one rising left-to-right, one falling.
 * A west wall runs down-left across the screen and needs the rising cell; a north
 * wall runs down-right and needs the falling one.
 *
 * Using the same cell for both is what makes a building render as a detached
 * staircase instead of continuous walls, so the pairing is not optional.
 *
 * The SE and SW sheets are *lighting* variants of the same geometry, not facings —
 * each side uses whichever is lit correctly for the way it faces.
 */
const WALL_MATERIAL = 0

function wallTextureIndex(side: WallSideId): number {
  return WALL_MATERIAL * 2 + (side === WallSide.West ? 0 : 1)
}

const GROUND_TEXTURES: ReadonlyMap<TileId, TextureRef> = new Map([
  [Tile.Grass, { sheet: 'grass', index: 0 }],
  // Nothing in the floor pack is true asphalt — it leans natural and fantasy — so
  // the road uses the darkest grey available. Real road surfaces are in the Town pack.
  [Tile.Road, { sheet: 'stones', index: 10 }],
  [Tile.Sidewalk, { sheet: 'tile', index: 2 }],
  [Tile.Floor, { sheet: 'wood', index: 0 }],
])

/**
 * @param sheets loaded tile sheets; any tile without one falls back to the
 *   code-drawn placeholder, so a missing or failed texture degrades to something
 *   visible rather than a hole in the world.
 */
export function buildSprites(sheets: ReadonlyMap<string, TileSheet>): Sprites {
  const ground = new Map<TileId, HTMLCanvasElement>()

  for (const [id, palette] of GROUND_PALETTES) {
    const ref = GROUND_TEXTURES.get(id)
    const textured = ref === undefined ? undefined : sheets.get(ref.sheet)?.tiles[ref.index]

    ground.set(id, textured ?? drawGroundTile(palette))
  }

  // Walls: one sprite per (kind, side). The art ships a separate render for each
  // facing rather than a mirror, because the brick coursing and lighting differ.
  const walls = new Map<string, HTMLCanvasElement>()

  const wallSources: readonly (readonly [WallId, string])[] = [
    [Wall.Solid, 'wall'],
    [Wall.Window, 'wall-window'],
  ]

  for (const [id, prefix] of wallSources) {
    for (const side of [WallSide.West, WallSide.North] as const) {
      const sheetName = `${prefix}-${side === WallSide.West ? 'se' : 'sw'}`
      const textured = sheets.get(sheetName)?.tiles[wallTextureIndex(side)]

      walls.set(wallSpriteKey(id, side), textured ?? drawEdgeWall(side, id === Wall.Window))
    }
  }

  const person: HTMLCanvasElement[] = []
  const step = (Math.PI * 2) / FACINGS
  for (let i = 0; i < FACINGS; i++) {
    const angle = i * step
    person.push(drawPerson(Math.cos(angle), Math.sin(angle)))
  }

  return { ground, walls, person }
}
