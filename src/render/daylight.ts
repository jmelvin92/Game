/**
 * Daylight: the sun, the shadows it casts, and the colour it puts on everything.
 *
 * The night side of the lighting system had a lot of work put into it and the day
 * side had none, which is why the game looked worse lit than unlit. Darkness hides
 * what has not been done; daylight shows all of it. Three things fix most of that,
 * and none of them are expensive:
 *
 * - a sun with a **direction**, so surfaces facing different ways are lit
 *   differently and buildings read as solid rather than as flat panels
 * - **shadows on the ground**, which is what stops everything looking like it is
 *   hovering a little above the world
 * - **colour that changes through the day**, so noon and late afternoon are not the
 *   same picture at different brightnesses
 */

export interface Sun {
  /** 0 below the horizon through to 1 directly overhead. */
  readonly elevation: number
  /** Where shadows fall, in screen pixels per unit of object height. */
  readonly shadowX: number
  readonly shadowY: number
  /** How dark a cast shadow is. */
  readonly shadowAlpha: number
  /** Multiply tint laid over the whole scene. */
  readonly tint: string
  readonly tintAlpha: number
  /** Extra darkening for surfaces facing away from the sun. */
  readonly backlitShade: number
}

/**
 * How far a shadow reaches per unit of object height, at a low and a high sun.
 *
 * Kept well short of physically correct. A three-storey building at dawn would
 * throw a shadow across the entire street, which is true and unreadable — it stops
 * looking like a shadow and starts looking like a stain on the map.
 */
const MAX_SHADOW = 1.15
const MIN_SHADOW = 0.32

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * The sun at a given time of day.
 *
 * Deliberately not astronomically correct. What matters is that low sun means long
 * warm shadows and high sun means short neutral ones, and that the transition is
 * slow enough to be worth looking at — the hour either side of dawn and dusk is the
 * best the game will ever look and is worth stretching.
 */
export function sunAt(fraction: number): Sun {
  const hour = fraction * 24

  // Below the horizon: no sun, no shadows, and the night pass takes over.
  if (hour < 5 || hour > 20) {
    return {
      elevation: 0,
      shadowX: 0,
      shadowY: 0,
      shadowAlpha: 0,
      tint: 'rgb(90, 110, 170)',
      tintAlpha: 0,
      backlitShade: 0,
    }
  }

  // 0 at first light, 1 at noon, back to 0 at dusk.
  const day = (hour - 5) / 15
  const elevation = Math.sin(day * Math.PI)

  // Shadows swing from pointing one way at dawn to the other at dusk, passing
  // through short and almost directly down at noon.
  const swing = (day - 0.5) * 2
  const length = mix(MAX_SHADOW, MIN_SHADOW, elevation)

  // Warm and heavy at the ends of the day, thin and neutral in the middle.
  const lowSun = 1 - elevation
  const warmth = lowSun * lowSun

  return {
    elevation,
    shadowX: -swing * length * 26,
    shadowY: length * 13,
    shadowAlpha: mix(0.16, 0.34, elevation),
    tint: warmth > 0.35 ? 'rgb(255, 176, 106)' : 'rgb(214, 226, 255)',
    tintAlpha: warmth > 0.35 ? warmth * 0.3 : (1 - warmth) * 0.07,
    backlitShade: mix(0.3, 0.14, elevation),
  }
}

/**
 * Lays the sun's colour over the finished scene.
 *
 * Multiply rather than a plain overlay, so it deepens what is already there
 * instead of washing a flat colour across it — the difference between light
 * falling on the world and a sheet of cellophane in front of it.
 */
export function gradeDaylight(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sun: Sun,
): void {
  if (sun.tintAlpha <= 0.002) return

  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = sun.tintAlpha
  ctx.fillStyle = sun.tint
  ctx.fillRect(0, 0, width, height)
  ctx.restore()

  // A little contrast back, because multiply alone flattens the midtones and the
  // scene starts to look muddy rather than lit.
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = sun.tintAlpha * 0.4
  ctx.fillStyle = sun.tint
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}
