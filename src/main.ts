import { createAudio } from '@/core/audio'
import { createInput } from '@/core/input'
import { createRng } from '@/core/rng'
import { createClock } from '@/core/time'
import { startLoop } from '@/core/loop'
import { createActor } from '@/entity/actor'
import { createInventory } from '@/entity/inventory'
import { createFootsteps } from '@/entity/footsteps'
import { createHunterPack } from '@/entity/hunters'
import { canChannel, channel, createVitals, updateVitals } from '@/entity/vitals'
import { moveActor } from '@/entity/movement'
import { createCamera, followCamera } from '@/render/camera'
import { TILE_H, TILE_W } from '@/render/iso'
import { gradeDaylight, sunAt } from '@/render/daylight'
import { applyGrade, createGrade } from '@/render/grade'
import { darknessAt, renderLighting } from '@/render/lighting'
import { renderInventory } from '@/render/inventoryOverlay'
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
import { drainCharges } from '@/world/grid'
import { createSandbox, SANDBOX_SEED, SPAWN } from '@/world/sandbox'
import { deviceDef, LampCondition, nearestDevice } from '@/world/props'
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
  // The backpack. preventDefault matters: Tab otherwise moves browser focus,
  // and the second press goes to whatever it landed on instead of the game.
  if (event.code === 'Tab') {
    event.preventDefault()
    backpackOpen = !backpackOpen
  }

  // Time controls. Anything to do with light has to be judged while it changes,
  // and a twenty-minute day is far too slow to tune dusk against.
  if (event.code === 'BracketLeft') clock.setDayLength(clock.dayLength() * 2)
  if (event.code === 'BracketRight') clock.setDayLength(clock.dayLength() / 2)
  if (event.code === 'Backslash') clock.setPaused(!clock.paused())
  // Nudge time by an hour either way. Waiting out a twenty-minute cycle to see
  // whether dawn looks right is not a workable way to judge whether dawn looks
  // right, and halving the day length to get there changes the thing being judged.
  if (event.code === 'Comma') clock.setHour(clock.hour() - 1)
  if (event.code === 'Period') clock.setHour(clock.hour() + 1)
  // Everything, then the clock alone, then nothing. The last of those is not
  // decoration: judging whether the world looks any good is impossible with a
  // debug readout sitting on top of it.
  if (event.code === 'KeyH') hudDetail = (hudDetail + 2) % 3

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
type CharacterFrames = ReadonlyMap<AnimationId, readonly (readonly HTMLCanvasElement[])[]>

// Which animations each character has art for. The White Eyes never walk — they
// stand, or they come for you.
const CHARACTERS: Readonly<Record<string, readonly AnimationId[]>> = {
  player: [Animation.Idle, Animation.Walk, Animation.Run],
  'white-eyes': [Animation.Idle, Animation.Run],
}

const characterSheets = new Map<string, CharacterFrames>()

await Promise.all(
  Object.entries(CHARACTERS).map(async ([name, animations]) => {
    const frames = new Map<AnimationId, readonly (readonly HTMLCanvasElement[])[]>()

    await Promise.all(
      animations.map(async (id) => {
        try {
          frames.set(
            id,
            await loadSpriteGrid(
              `/sprites/${name}-${id}.png`,
              ANIMATIONS[id].frames,
              SHEET_ROWS,
              CHARACTER_SCALE,
            ),
          )
        } catch {
          // Left out; buildSprites falls back for this animation.
        }
      }),
    )

    if (frames.size > 0) characterSheets.set(name, frames)
  }),
)

const sprites = buildSprites(sheets, characterSheets)

// The torch is a toggle rather than a held key: it is a thing you switch on and
// leave on, not something you hold down while walking.
let torchOn = true

/**
 * How loud the White Eyes are at their loudest, right beside you.
 *
 * Very quiet. They are meant to be heard before they are seen, which needs them
 * to be audible at all — and light-footed, which needs them not to announce
 * themselves. The gap between those is the whole point: a sound you have to stop
 * and listen for.
 */
const HUNTER_STEP_VOLUME = 0.3

/** Tiles beyond which they cannot be heard at all. */
const HUNTER_HEARING_RANGE = 24

/**
 * Plays a sound as coming from somewhere in the world.
 *
 * Volume falls off with distance and the stereo position follows the screen, so a
 * footfall in the dark tells the player roughly how far and which side. That is the
 * only information they get before anything becomes visible, so it is worth more
 * than it costs.
 */
function playPositional(name: string, x: number, y: number, loudest: number, rate: number): void {
  const dx = x - actor.x
  const dy = y - actor.y
  const distance = Math.hypot(dx, dy)
  if (distance > HUNTER_HEARING_RANGE) return

  // Squared falloff, so something close is much louder than something halfway —
  // which is what makes the difference between "somewhere out there" and "here".
  const nearness = 1 - distance / HUNTER_HEARING_RANGE

  // Screen-space left/right, using the same projection the sprites use, so what
  // is heard on the left is drawn on the left.
  const screenX = dx - dy

  audio.play(name, {
    volume: loudest * nearness * nearness,
    rate,
    pan: Math.max(-1, Math.min(1, screenX / 18)),
  })
}

const vitals = createVitals()
const inventory = createInventory()
const hunters = createHunterPack()

// One generator for everything that happens during play, seeded apart from the
// world's, so a spawn cannot change how the town was built.
const playRng = createRng(0x5eed ^ SANDBOX_SEED)

/** Set when the player is caught. Everything stops and the cutscene plays. */
let dead = false

function die(): void {
  if (dead) return
  dead = true

  hunters.clear()

  const video = document.createElement('video')
  video.src = '/video-death.mp4'
  video.autoplay = true
  video.playsInline = true
  video.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;object-fit:cover;background:#000;z-index:10'
  document.body.appendChild(video)

  // The overlay stays after the video ends rather than returning to a frozen
  // game behind it, so the run is unambiguously over.
  video.addEventListener('ended', () => {
    video.style.opacity = '0'
    video.style.transition = 'opacity 1.2s'

    const over = document.createElement('div')
    over.textContent = 'reload to begin again'
    over.style.cssText =
      'position:fixed;inset:0;display:grid;place-items:center;z-index:11;' +
      'background:#000;color:#6b7280;font:14px ui-monospace,monospace;letter-spacing:0.2em'
    document.body.appendChild(over)
  })
}

/** How far the gift reaches, in tiles. Close enough that you must walk to a lamp. */
const CHANNEL_REACH = 2.2

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyF') torchOn = !torchOn

  if (event.code === 'KeyE') {
    const device = nearestDevice(grid, actor.x, actor.y, CHANNEL_REACH)
    if (device === undefined) return

    const definition = deviceDef(device.prop)
    if (definition === undefined) return

    // Broken fittings will not hold a charge until repaired, which is daytime work
    // that does not exist yet. Refusing outright rather than silently doing nothing
    // is what will make that gap obvious when it starts to matter.
    if (device.condition === LampCondition.Broken) return

    // Already running: topping up would let one device be kept alive indefinitely
    // for the price of a trickle, which is not what a charge is meant to be.
    if (grid.chargeAt(device.x, device.y) > 0) return
    if (!canChannel(vitals, definition.cost)) return

    grid.setCharge(device.x, device.y, definition.duration)
    channel(vitals, definition.cost)
  }
})

// Starts at dusk rather than in the middle of the night. Loading into full dark
// meant the first six real minutes had no change in them at all — the clock on the
// HUD advanced and the picture did not, which reads as a broken cycle rather than
// as a slow one. From here the light is visibly failing within seconds and night
// has fallen inside three minutes.
const clock = createClock(17.5)
// Exposed on the dev handle so it can be dialled while looking at the game.
// Grading is judged by eye and nothing else; guessing at numbers here and
// rebuilding to see them is the slow way to do it.
const grade = createGrade()

if (import.meta.env.DEV) {
  // Exposed so the running game can be inspected and driven from the browser
  // console during development — which is how changes get verified here, since
  // Joshua does not debug. Stripped from production builds by the `DEV` guard.
  Object.defineProperty(window, 'game', {
    value: { grid, actor, camera, input, clock, vitals, hunters, inventory, sunAt, grade },
  })
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
const shadowBuffer = document.createElement('canvas')

let elapsed = 0

/** 2 shows the full readout, 1 the clock alone, 0 nothing. Cycled with H. */
let hudDetail = 2

/**
 * Whether the backpack panel is up. UI state, so it lives here with the input
 * that flips it — the inventory itself neither knows nor cares.
 */
let backpackOpen = false

/** How far the panel has arrived, 0..1. Driven toward the toggle each frame so
    the bag opens in about a tenth of a second instead of teleporting in. */
let backpackShown = 0

startLoop(
  (step) => {
    elapsed += step
    clock.advance(step)

    // UI easing runs on the same clock as everything else.
    const target = backpackOpen ? 1 : 0
    backpackShown += (target - backpackShown) * Math.min(1, step * 14)
    if (Math.abs(target - backpackShown) < 0.01) backpackShown = target

    // Daylight is the only thing that restores the gift, so the cycle is what
    // paces the whole loop rather than a regeneration timer.
    if (dead) return

    const darkness = darknessAt(clock.fraction)

    updateVitals(vitals, step, 1 - darkness)
    drainCharges(grid, step)

    if (hunters.update(grid, actor, torchOn, step, darkness, playRng)) die()

    // Being noticed gets one cue, however many of them noticed. Layering swells
    // would turn a warning into noise at exactly the moment it needs to be clear.
    if (hunters.justNoticed) audio.play('notice', { volume: 0.55 })

    for (const footfall of hunters.footfalls) {
      playPositional(
        `footstep-${tileDef(grid.at(Math.floor(footfall.x), Math.floor(footfall.y))).name}`,
        footfall.x,
        footfall.y,
        HUNTER_STEP_VOLUME,
        // Pitched well down. It is the same recording as the player's own steps,
        // and dropping it is most of what makes it read as something heavier and
        // wrong rather than as a second person walking.
        0.62 + Math.random() * 0.1,
      )
    }

    // The gift running the body down is its own end, separate from being caught.
    if (vitals.health <= 0) die()

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

    const sun = sunAt(clock.fraction)

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
      hunters: hunters.hunters,
      sun,
      shadowBuffer,
    })

    // Daylight grading first, then the night pass over the top. They never both
    // do much at once — the sun is gone by the time darkness matters — but dusk
    // has a little of each and looks better for the overlap.
    gradeDaylight(ctx, logicalWidth, logicalHeight, sun)

    // Grading before the night pass, not after. Darkness is a light in the scene,
    // not a look applied to it — grading on top of it was darkening an already
    // black picture and vignetting it twice.
    applyGrade(ctx, logicalWidth, logicalHeight, grade, 1 - darknessAt(clock.fraction))

    renderLighting(
      ctx,
      lightBuffer,
      logicalWidth,
      logicalHeight,
      darknessAt(clock.fraction),
      { colour: 'rgb(0, 0, 0)', alpha: 0 },
      lights,
    )

    // The HUD and the vitals overlay are drawn unscaled, or they would grow with
    // the world.
    const ratio = window.devicePixelRatio || 1
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

    renderVitals(ctx, viewWidth, viewHeight, vitals, elapsed, hunters.noticedFor)
    if (backpackShown > 0.01) {
      renderInventory(ctx, viewWidth, viewHeight, inventory, backpackShown)
    }
    if (hudDetail > 0) {
      drawHud(ctx, {
        actor,
        grid,
        clock,
        torch: torchOn,
        zoom,
        width: viewWidth,
        darkness: darknessAt(clock.fraction),
        detail: hudDetail,
      })
    }
  },
)
