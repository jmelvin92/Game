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

export interface Light {
  /** Screen position, already offset by the camera. */
  readonly x: number
  readonly y: number
  readonly radius: number
  /** 0 to 1. Scales both the hole cut in the darkness and the glow. */
  readonly strength: number
  readonly colour: string
  /** Present for directional lights such as a torch. Radians, screen space. */
  readonly direction?: number
  /** Total width of the cone, in radians. Ignored without a direction. */
  readonly cone?: number
}

/** Night is blue rather than black: pure black reads as a bug, not as darkness. */
const NIGHT_COLOUR = { r: 8, g: 14, b: 34 }

/**
 * How dark it is at a given time of day, 0 to 1.
 *
 * Dusk and dawn are stretched deliberately. Most of a day/night cycle's atmosphere
 * lives in the transitions, and rushing them wastes the best-looking part.
 */
export function darknessAt(fraction: number): number {
  const hour = fraction * 24

  if (hour >= 21 || hour < 4) return 1
  if (hour >= 19) return (hour - 19) / 2
  if (hour < 6) return 1 - (hour - 4) / 2
  return 0
}

/** A tint laid over the world before darkness, warm at dusk and cold at dawn. */
export function skyTint(fraction: number): { colour: string; alpha: number } {
  const hour = fraction * 24

  if (hour >= 17 && hour < 21) {
    // Evening: low sun, everything goes amber.
    const t = 1 - Math.abs(hour - 19) / 2
    return { colour: 'rgb(255, 138, 62)', alpha: 0.22 * t }
  }
  if (hour >= 4 && hour < 8) {
    const t = 1 - Math.abs(hour - 6) / 2
    return { colour: 'rgb(120, 150, 220)', alpha: 0.18 * t }
  }
  return { colour: 'rgb(0, 0, 0)', alpha: 0 }
}

/** Traces the lit area of a light — a disc, or a cone if it has a direction. */
function lightPath(ctx: CanvasRenderingContext2D, light: Light): void {
  ctx.beginPath()

  if (light.direction === undefined || light.cone === undefined) {
    ctx.arc(light.x, light.y, light.radius, 0, Math.PI * 2)
    return
  }

  const half = light.cone / 2
  ctx.moveTo(light.x, light.y)
  ctx.arc(light.x, light.y, light.radius, light.direction - half, light.direction + half)
  ctx.closePath()
}

function fade(ctx: CanvasRenderingContext2D, light: Light, inner: string, outer: string) {
  const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius)
  gradient.addColorStop(0, inner)
  gradient.addColorStop(1, outer)
  return gradient
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
  shade.fillStyle = `rgba(${String(NIGHT_COLOUR.r)}, ${String(NIGHT_COLOUR.g)}, ${String(NIGHT_COLOUR.b)}, ${String(0.88 * darkness)})`
  shade.fillRect(0, 0, width, height)

  // Cut the lit areas out of the darkness. Softly, so lights have edges you can
  // see past rather than a hard circle of daylight.
  shade.globalCompositeOperation = 'destination-out'
  for (const light of lights) {
    shade.fillStyle = fade(
      shade,
      light,
      `rgba(255, 255, 255, ${String(0.95 * light.strength)})`,
      'rgba(255, 255, 255, 0)',
    )
    lightPath(shade, light)
    shade.fill()
  }

  ctx.drawImage(buffer, 0, 0)

  // Then add the light's own colour on top, which is what makes a sodium lamp look
  // like a sodium lamp rather than a hole in the night.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const light of lights) {
    ctx.globalAlpha = 0.4 * light.strength * darkness
    ctx.fillStyle = fade(ctx, light, light.colour, 'rgba(0, 0, 0, 0)')
    lightPath(ctx, light)
    ctx.fill()
  }
  ctx.restore()
}
