import { createInput } from '@/core/input'
import { startLoop } from '@/core/loop'
import { createActor } from '@/entity/actor'
import { moveActor } from '@/entity/movement'
import { createCamera, followCamera } from '@/render/camera'
import { TILE_H, TILE_W } from '@/render/iso'
import { drawHud, renderScene } from '@/render/renderer'
import {
  Animation,
  ANIMATIONS,
  buildSprites,
  CHARACTER_SCALE,
  SHEET_ROWS,
  WALL_H,
  WALL_W,
  type AnimationId,
} from '@/render/sprites'
import { loadSpriteGrid, loadTileSheets } from '@/render/textures'
import { createSandbox, SPAWN } from '@/world/sandbox'

/**
 * Entry point: builds the world, wires input to the simulation, and starts the loop.
 */

const root = document.querySelector<HTMLDivElement>('#app')
if (root === null) {
  throw new Error('Expected an element with id "app" in index.html')
}

const canvas = document.createElement('canvas')
root.appendChild(canvas)

// Narrowing a `const` does not survive into the closures below, so the null check
// happens inside a function whose return type is already non-null.
function context2d(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = target.getContext('2d')
  if (context === null) throw new Error('2D canvas context unavailable')
  return context
}

const ctx = context2d(canvas)

let viewWidth = 0
let viewHeight = 0

/**
 * Size the canvas to the window in CSS pixels while backing it with the display's
 * real pixels, so the render is sharp rather than upscaled on a retina screen.
 */
function resize(): void {
  const ratio = window.devicePixelRatio || 1

  viewWidth = window.innerWidth
  viewHeight = window.innerHeight

  canvas.width = Math.round(viewWidth * ratio)
  canvas.height = Math.round(viewHeight * ratio)
  canvas.style.width = `${String(viewWidth)}px`
  canvas.style.height = `${String(viewHeight)}px`

  // Drawing then happens in CSS pixels and the scaling is handled once, here.
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
}

resize()
window.addEventListener('resize', resize)

const grid = createSandbox()
const actor = createActor(SPAWN.x, SPAWN.y)
const camera = createCamera(actor.x, actor.y)
const input = createInput()

// Textures must be decoded and keyed before the first frame, so the world never
// flashes untextured. Sheets load concurrently; this is a few hundred milliseconds.
const [groundSheets, wallSheets] = await Promise.all([
  loadTileSheets(
    {
      grass: '/tiles/grass.png',
      rocky: '/tiles/rocky.png',
      stones: '/tiles/stones.png',
      dry: '/tiles/dry.png',
      stone: '/tiles/stone.png',
      tile: '/tiles/tile.png',
      wood: '/tiles/wood.png',
    },
    TILE_W,
    TILE_H,
  ),
  // Wall segments span half a tile and stand a tile tall, so they slice on a
  // different grid to the ground.
  loadTileSheets(
    {
      'wall-brick-se': '/tiles/wall-brick-se.png',
      'wall-brick-sw': '/tiles/wall-brick-sw.png',
      'wall-brick-window-se': '/tiles/wall-brick-window-se.png',
      'wall-brick-window-sw': '/tiles/wall-brick-window-sw.png',
      'wall-stone-se': '/tiles/wall-stone-se.png',
      'wall-stone-sw': '/tiles/wall-stone-sw.png',
      'wall-stone-window-se': '/tiles/wall-stone-window-se.png',
      'wall-stone-window-sw': '/tiles/wall-stone-window-sw.png',
      'wall-wood-se': '/tiles/wall-wood-se.png',
      'wall-wood-sw': '/tiles/wall-wood-sw.png',
      'wall-wood-window-se': '/tiles/wall-wood-window-se.png',
      'wall-wood-window-sw': '/tiles/wall-wood-window-sw.png',
    },
    WALL_W,
    WALL_H,
  ),
])

const sheets = new Map([...groundSheets, ...wallSheets])

// Character art. If a sheet is missing the placeholder character is used instead,
// so a failed load never leaves the player with nothing to control.
const characterSheets = new Map<AnimationId, readonly (readonly HTMLCanvasElement[])[]>()

await Promise.all(
  (
    [
      [Animation.Idle, '/sprites/idle.png'],
      [Animation.Walk, '/sprites/walk.png'],
      [Animation.Run, '/sprites/run.png'],
    ] as const
  ).map(async ([id, url]) => {
    try {
      characterSheets.set(
        id,
        await loadSpriteGrid(url, ANIMATIONS[id].frames, SHEET_ROWS, CHARACTER_SCALE),
      )
    } catch {
      // Left out of the map; buildSprites falls back for this animation.
    }
  }),
)

const sprites = buildSprites(sheets, characterSheets)

if (import.meta.env.DEV) {
  // Exposed so the running game can be inspected and driven from the browser
  // console during development — which is how changes get verified here, since
  // Joshua does not debug. Stripped from production builds by the `DEV` guard.
  Object.defineProperty(window, 'game', { value: { grid, actor, camera, input } })
}

let elapsed = 0

startLoop(
  (step) => {
    elapsed += step

    const direction = input.direction()
    moveActor(actor, grid, direction.x, direction.y, step, input.running())
    followCamera(camera, actor.x, actor.y, step)
  },
  () => {
    renderScene(ctx, viewWidth, viewHeight, { grid, actor, camera, sprites, time: elapsed })
    drawHud(ctx, actor, grid)
  },
)
