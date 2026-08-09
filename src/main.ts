import { createInput } from '@/core/input'
import { startLoop } from '@/core/loop'
import { createActor } from '@/entity/actor'
import { moveActor } from '@/entity/movement'
import { createCamera, followCamera } from '@/render/camera'
import { drawHud, renderScene } from '@/render/renderer'
import { buildSprites } from '@/render/sprites'
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
const sprites = buildSprites()
const input = createInput()

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
    moveActor(actor, grid, direction.x, direction.y, step)
    followCamera(camera, actor.x, actor.y, step)
  },
  () => {
    renderScene(ctx, viewWidth, viewHeight, { grid, actor, camera, sprites, time: elapsed })
    drawHud(ctx, actor, grid)
  },
)
