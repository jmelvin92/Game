import { createAudio } from '@/core/audio'
import { createInput } from '@/core/input'
import { createClock } from '@/core/time'
import { startLoop } from '@/core/loop'
import { createActor } from '@/entity/actor'
import { createFootsteps } from '@/entity/footsteps'
import { moveActor } from '@/entity/movement'
import { createCamera, followCamera } from '@/render/camera'
import { TILE_H, TILE_W } from '@/render/iso'
import { darknessAt, renderLighting, skyTint } from '@/render/lighting'
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

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyF') torchOn = !torchOn
})

// Starts at night, which is the half worth building first and the half that shows
// whether the lighting works at all.
const clock = createClock(22)

if (import.meta.env.DEV) {
  // Exposed so the running game can be inspected and driven from the browser
  // console during development — which is how changes get verified here, since
  // Joshua does not debug. Stripped from production builds by the `DEV` guard.
  Object.defineProperty(window, 'game', { value: { grid, actor, camera, input, clock } })
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
    const lights = renderScene(ctx, viewWidth, viewHeight, {
      grid,
      actor,
      camera,
      sprites,
      time: elapsed,
      dayFraction: clock.fraction,
      torch: torchOn,
    })

    renderLighting(
      ctx,
      lightBuffer,
      viewWidth,
      viewHeight,
      darknessAt(clock.fraction),
      skyTint(clock.fraction),
      lights,
    )

    drawHud(ctx, actor, grid, clock.label(), torchOn)
  },
)
