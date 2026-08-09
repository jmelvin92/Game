import { createAudio } from '@/core/audio'
import { createInput } from '@/core/input'
import { createClock } from '@/core/time'
import { startLoop } from '@/core/loop'
import { createActor } from '@/entity/actor'
import { createFootsteps } from '@/entity/footsteps'
import { canChannel, channel, createVitals, updateVitals } from '@/entity/vitals'
import { moveActor } from '@/entity/movement'
import { createCamera, followCamera } from '@/render/camera'
import { TILE_H, TILE_W } from '@/render/iso'
import { darknessAt, renderLighting, skyTint } from '@/render/lighting'
import { drawHud, renderScene } from '@/render/renderer'
import { renderVitals } from '@/render/vitalsOverlay'
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
import { LampState, nearestLamp, Prop } from '@/world/props'
import { tileDef } from '@/world/tiles'

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
 * How much the world is magnified.
 *
 * Applied as a canvas transform rather than by changing the tile size, so nothing
 * downstream — projection, culling, sprite sizes — has to know about it. The
 * viewport handed to the renderer is divided by it instead, which is what keeps
 * culling correct: at 2x you can see half as much world, not the same amount
 * drawn twice as large.
 */
const MIN_ZOOM = 0.7
const MAX_ZOOM = 3
let zoom = 1.6

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
}

/** Combines the display's pixel ratio with the zoom into one transform. */
function applyTransform(): void {
  const ratio = window.devicePixelRatio || 1
  ctx.setTransform(ratio * zoom, 0, 0, ratio * zoom, 0, 0)

  // Off, so the pixel art stays crisp when magnified rather than turning to mush.
  ctx.imageSmoothingEnabled = false
}

resize()
window.addEventListener('resize', resize)

function setZoom(next: number): void {
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
}

// Wheel to zoom, and keys for anyone without one. Multiplicative rather than
// additive, so each notch feels the same at any magnification.
window.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    setZoom(zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12))
  },
  { passive: false },
)

window.addEventListener('keydown', (event) => {
  if (event.code === 'Equal' || event.code === 'NumpadAdd') setZoom(zoom * 1.15)
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') setZoom(zoom / 1.15)
  if (event.code === 'Digit0') setZoom(1.6)
})

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
      forest: '/tiles/forest.png',
      terrain: '/tiles/terrain.png',
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
      'facade-1': '/tiles/facade-1.png',
      'facade-2': '/tiles/facade-2.png',
      'facade-3': '/tiles/facade-3.png',
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

// The torch is a toggle rather than a held key: it is a thing you switch on and
// leave on, not something you hold down while walking.
let torchOn = true

const vitals = createVitals()

/** How far the gift reaches, in tiles. Close enough that you must walk to a lamp. */
const CHANNEL_REACH = 2.2

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyF') torchOn = !torchOn

  if (event.code === 'KeyE') {
    const lamp = nearestLamp(grid, actor.x, actor.y, CHANNEL_REACH)

    // A broken lamp cannot be woken — it needs repairing first, which is daytime
    // work and does not exist yet. Refusing here rather than silently doing
    // nothing is what will make that gap obvious when it matters.
    if (lamp === undefined || lamp.state === LampState.Broken) return
    if (lamp.state === LampState.Working) return
    if (!canChannel(vitals)) return

    grid.setProp(lamp.x, lamp.y, Prop.LampPost, LampState.Working)
    channel(vitals)
  }
})

// Starts at night, which is the half worth building first and the half that shows
// whether the lighting works at all.
const clock = createClock(22)

if (import.meta.env.DEV) {
  // Exposed so the running game can be inspected and driven from the browser
  // console during development — which is how changes get verified here, since
  // Joshua does not debug. Stripped from production builds by the `DEV` guard.
  Object.defineProperty(window, 'game', { value: { grid, actor, camera, input, clock, vitals } })
}

// Sound. Surfaces without a recording stay silent rather than borrowing another's,
// which would be worse than the gap and would hide which are still missing.
const audio = createAudio()
const footsteps = createFootsteps()

// Clips are discovered from a manifest the splitting tool writes, so adding a
// surface is a matter of running that tool — nothing here names a file.
void fetch('/audio/manifest.json')
  .then((response) => response.json() as Promise<Record<string, string[]>>)
  .then((manifest) => audio.load(manifest))
  .catch(() => {
    // No manifest means no sound. Worth nothing more than silence.
  })
// Browsers refuse to play anything until the user has interacted with the page,
// so the context is resumed from the first input rather than at load.
for (const event of ['keydown', 'pointerdown'] as const) {
  window.addEventListener(event, () => {
    audio.resume()
  })
}

// One scratch canvas for the lighting pass, reused every frame. Allocating one per
// frame is the difference between the effect being free and being the most
// expensive thing in the renderer.
const lightBuffer = document.createElement('canvas')

let elapsed = 0

startLoop(
  (step) => {
    elapsed += step
    clock.advance(step)

    // Daylight is the only thing that restores the gift, so the cycle is what
    // paces the whole loop rather than a regeneration timer.
    updateVitals(vitals, step, 1 - darknessAt(clock.fraction))

    const direction = input.direction()
    const wasX = actor.x
    const wasY = actor.y

    moveActor(actor, grid, direction.x, direction.y, step, input.running())

    if (footsteps.update(actor, wasX, wasY)) {
      const surface = tileDef(grid.at(Math.floor(actor.x), Math.floor(actor.y))).name

      // Pitch and volume wander slightly on every step. Even with fifteen
      // recordings, identical playback of the same one is instantly recognisable.
      audio.play(`footstep-${surface}`, {
        rate: 0.92 + Math.random() * 0.16,
        volume: (actor.running ? 0.85 : 0.6) * (0.85 + Math.random() * 0.3),
      })
    }
    followCamera(camera, actor.x, actor.y, step)
  },
  () => {
    applyTransform()

    // The renderer works in world-space pixels. At 2x the viewport shows half as
    // much of it, so it is told the smaller size and never learns about zoom.
    const logicalWidth = viewWidth / zoom
    const logicalHeight = viewHeight / zoom

    const lights = renderScene(ctx, logicalWidth, logicalHeight, {
      grid,
      actor,
      camera,
      sprites,
      time: elapsed,
      dayFraction: clock.fraction,
      torch: torchOn,
      power: vitals.power,
    })

    renderLighting(
      ctx,
      lightBuffer,
      logicalWidth,
      logicalHeight,
      darknessAt(clock.fraction),
      skyTint(clock.fraction),
      lights,
    )

    // The HUD and the vitals overlay are drawn unscaled, or they would grow with
    // the world.
    const ratio = window.devicePixelRatio || 1
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

    renderVitals(ctx, viewWidth, viewHeight, vitals, elapsed)
    drawHud(ctx, actor, grid, clock.label(), torchOn, zoom)
  },
)
