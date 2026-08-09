/**
 * Lighting.
 *
 * The world is drawn at full brightness, then covered with a sheet of darkness
 * with holes cut in it where lights are, and finally given a pass of warm glow.
 * Three steps, no per-pixel work, and it costs the same whatever the map size.
 *
 * **Light passes through walls.** A lamp indoors will glow onto the street. Fixing
 * that means casting shadows from every light against every opaque wall, which is
 * a substantially harder problem than everything here put together — the `opaque`
 * flags on walls and props exist for when it is worth doing, and until then this
 * reads well enough that it is not the thing you notice.
 */

import { sunAltitude } from '@/core/time'

export interface Light {
  /** Screen position, already offset by the camera. */
  readonly x: number
  readonly y: number
  readonly radius: number
  /** 0 to 1. Scales both the hole cut in the darkness and the glow. */
  readonly strength: number
  /** A colour with the literal token `ALPHA` where its opacity goes, so the
      falloff curve can vary it per gradient stop. */
  readonly colour: string
  /** Present for directional lights such as a torch. Radians, screen space. */
  readonly direction?: number
  /** Total width of the cone, in radians. Ignored without a direction. */
  readonly cone?: number
}

/** Night is blue rather than black: pure black reads as a bug, not as darkness. */
const NIGHT_COLOUR = { r: 4, g: 7, b: 19 }

/**
 * Sun altitude at or above which it is fully light.
 *
 * Above the horizon rather than at it, because the last of the sun does not light
 * a street the way the middle of the afternoon does.
 */
const FULL_LIGHT_ALTITUDE = 0.4

/**
 * How much further the sun must sink below that before it is fully dark.
 *
 * This number is what sets the length of dusk and dawn, and it is deliberately
 * large: it puts roughly half the cycle in twilight, leaving about four hours of
 * genuine dark around midnight. Most of the atmosphere in a day/night cycle lives
 * in the transitions, and they are also the only part where the picture is visibly
 * changing — an earlier version gave them a linear two hours each, and the result
 * was six real minutes of an unchanging black screen, a sunrise that arrived in
 * ninety seconds, and a cycle that looked broken because nothing moved.
 */
const TWILIGHT_DEPTH = 1.25

/**
 * How dark it is at a given time of day, 0 to 1.
 *
 * Continuous, and derived from {@link sunAltitude} so it can never disagree with
 * where the shadows say the sun is.
 */
export function darknessAt(fraction: number): number {
  const below = FULL_LIGHT_ALTITUDE - sunAltitude(fraction)
  return Math.max(0, Math.min(1, below / TWILIGHT_DEPTH))
}

/**
 * A tint laid over the world before darkness, warm at dusk and cold at dawn.
 *
 * Centred on the middle of each twilight and about as wide, so the colour arrives
 * with the failing light rather than before or after it.
 */
const TWILIGHT_SPAN = 2.6

export function skyTint(fraction: number): { colour: string; alpha: number } {
  const hour = fraction * 24

  const dusk = 1 - Math.abs(hour - 18.9) / TWILIGHT_SPAN
  if (dusk > 0) {
    // Evening: low sun, everything goes amber.
    return { colour: 'rgb(255, 138, 62)', alpha: 0.22 * dusk }
  }

  const dawn = 1 - Math.abs(hour - 5.1) / TWILIGHT_SPAN
  if (dawn > 0) {
    return { colour: 'rgb(120, 150, 220)', alpha: 0.18 * dawn }
  }

  return { colour: 'rgb(0, 0, 0)', alpha: 0 }
}

/**
 * How brightly a failing lamp is burning at this instant.
 *
 * Mostly on with sudden brief dropouts, rather than a smooth pulse — a lamp about
 * to fail stutters, and a sine wave reads as something magical instead. The seed
 * gives every lamp its own rhythm, so a street of them never blinks in unison.
 */
export function flicker(seed: number, time: number): number {
  const t = time * 6.3 + seed * 12.9898

  // Two out-of-phase waves beat against each other, so the dropouts arrive at
  // irregular intervals rather than on a fixed period.
  const beat = Math.sin(t) + Math.sin(t * 1.7 + 1.3) * 0.6

  if (beat > 1.15) return 0.06
  if (beat > 1.02) return 0.42

  // Even when lit, a failing tube is never quite steady.
  return 0.86 + Math.sin(t * 5.1) * 0.09
}

/**
 * How much light reaches a given fraction of the way to a light's edge.
 *
 * A straight ramp from full to nothing — which is what a two-stop gradient gives
 * you — leaves a visible rim where it hits zero, and the eye reads that rim as the
 * edge of a spotlight rather than as light. Real falloff is steep near the source
 * and then trails off for a long way, so most of the radius is spent on a faint
 * tail nobody can point at.
 */
function falloff(t: number): number {
  const inverseSquare = 1 / (1 + 14 * t * t)
  // Forced to exactly zero at the rim, or the gradient still ends on a step.
  return inverseSquare * (1 - t) * (1 - t)
}

/** Number of stops used to approximate the curve. Enough to look continuous. */
const FALLOFF_STOPS = 10

function fade(
  ctx: CanvasRenderingContext2D,
  light: Light,
  peak: number,
  colour: (alpha: number) => string,
): CanvasGradient {
  const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius)

  for (let i = 0; i <= FALLOFF_STOPS; i++) {
    const t = i / FALLOFF_STOPS
    gradient.addColorStop(t, colour(peak * falloff(t)))
  }

  return gradient
}

/**
 * Fills a light's shape.
 *
 * Cone lights are painted as several nested cones rather than one, narrowing and
 * brightening toward the middle. A single cone has hard angular edges, which look
 * like a wedge cut out of the dark instead of a beam.
 */
function paintLight(
  ctx: CanvasRenderingContext2D,
  light: Light,
  peak: number,
  colour: (alpha: number) => string,
): void {
  if (light.direction === undefined || light.cone === undefined) {
    ctx.fillStyle = fade(ctx, light, peak, colour)
    ctx.beginPath()
    ctx.arc(light.x, light.y, light.radius, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  const layers = 4
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1)
    // Widest layer is faintest, so the beam has soft shoulders rather than a rim.
    const half = (light.cone / 2) * (1.15 - t * 0.55)
    ctx.fillStyle = fade(ctx, light, peak * (0.32 + t * 0.68) * (1 / layers) * 2.1, colour)

    ctx.beginPath()
    ctx.moveTo(light.x, light.y)
    ctx.arc(light.x, light.y, light.radius, light.direction - half, light.direction + half)
    ctx.closePath()
    ctx.fill()
  }
}

/**
 * Draws the darkness and the lights over an already-rendered scene.
 *
 * @param buffer scratch canvas the size of the viewport, reused between frames —
 *   allocating one per frame is the difference between this being free and being
 *   the most expensive thing in the renderer.
 */
export function renderLighting(
  ctx: CanvasRenderingContext2D,
  buffer: HTMLCanvasElement,
  width: number,
  height: number,
  darkness: number,
  tint: { colour: string; alpha: number },
  lights: readonly Light[],
): void {
  if (tint.alpha > 0.002) {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = tint.alpha
    ctx.fillStyle = tint.colour
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  if (darkness <= 0.002) return

  if (buffer.width !== width || buffer.height !== height) {
    buffer.width = width
    buffer.height = height
  }

  const shade = buffer.getContext('2d')
  if (shade === null) return

  shade.clearRect(0, 0, width, height)
  shade.globalCompositeOperation = 'source-over'
  shade.fillStyle = `rgba(${String(NIGHT_COLOUR.r)}, ${String(NIGHT_COLOUR.g)}, ${String(NIGHT_COLOUR.b)}, ${String(0.965 * darkness)})`
  shade.fillRect(0, 0, width, height)

  // Cut the lit areas out of the darkness. Softly, so lights have edges you can
  // see past rather than a hard circle of daylight.
  shade.globalCompositeOperation = 'destination-out'
  for (const light of lights) {
    paintLight(
      shade,
      light,
      0.97 * light.strength,
      (alpha) => `rgba(255, 255, 255, ${String(alpha)})`,
    )
  }

  ctx.drawImage(buffer, 0, 0)

  // Then add the light's own colour on top, which is what makes a sodium lamp look
  // like a sodium lamp rather than a hole in the night.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const light of lights) {
    paintLight(ctx, light, 0.5 * light.strength * darkness, (alpha) =>
      light.colour.replace('ALPHA', alpha.toFixed(3)),
    )
  }
  ctx.restore()
}
