import type { Vitals } from '@/entity/vitals'

/**
 * Showing health and power without showing health and power.
 *
 * No bars, no numbers. The world reports its own state: losing health closes the
 * edges of the vision in and drains the colour out of what is left, and channelling
 * leaves a cold flare that fades over a couple of seconds.
 *
 * The reason to prefer this over a meter is not restraint for its own sake. A bar
 * is read once and then ignored; a view that is visibly narrowing is felt
 * continuously and cannot be tuned out. It also keeps attention on the world at the
 * moment the player most needs to be looking at it.
 */

/** Health at which the edges begin to close in at all. */
const HEALTH_VISIBLE_BELOW = 0.75

/** Health at which the pulse of a heartbeat starts showing in the vignette. */
const HEALTH_PULSE_BELOW = 0.35

/** Power at which its own cold vignette begins. */
const POWER_VISIBLE_BELOW = 0.3

function vignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strength: number,
  colour: string,
): void {
  if (strength <= 0.002) return

  const cx = width / 2
  const cy = height / 2
  const outer = Math.hypot(cx, cy)

  // The clear centre shrinks as strength rises, which is what makes it read as
  // vision closing in rather than as a filter laid over the picture.
  const inner = outer * (0.82 - 0.55 * strength)

  const gradient = ctx.createRadialGradient(cx, cy, Math.max(0, inner), cx, cy, outer)
  gradient.addColorStop(0, colour.replace('ALPHA', '0'))
  gradient.addColorStop(1, colour.replace('ALPHA', (0.92 * strength).toFixed(3)))

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

export function renderVitals(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  vitals: Vitals,
  time: number,
): void {
  const { health, power, strainFor } = vitals

  if (health < HEALTH_VISIBLE_BELOW) {
    const hurt = (HEALTH_VISIBLE_BELOW - health) / HEALTH_VISIBLE_BELOW

    // Below a point the vignette beats. Rate rises as health falls, so the
    // quickening is itself the warning — no number needed to know it is worse.
    let pulse = 0
    if (health < HEALTH_PULSE_BELOW) {
      const urgency = 1 - health / HEALTH_PULSE_BELOW
      const beat = Math.sin(time * (5 + urgency * 5))
      pulse = Math.max(0, beat) * 0.16 * urgency
    }

    vignette(ctx, width, height, hurt * 0.85 + pulse, 'rgba(48, 4, 8, ALPHA)')

    // Colour drains as well as darkens. Losing saturation reads as fading rather
    // than as being in a red room.
    ctx.save()
    ctx.globalCompositeOperation = 'saturation'
    ctx.globalAlpha = Math.min(0.75, hurt * 0.9)
    ctx.fillStyle = 'hsl(0, 0%, 50%)'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  if (power < POWER_VISIBLE_BELOW) {
    const empty = (POWER_VISIBLE_BELOW - power) / POWER_VISIBLE_BELOW
    vignette(ctx, width, height, empty * 0.5, 'rgba(6, 16, 44, ALPHA)')
  }

  if (strainFor > 0) {
    // A cold flare that fades, so channelling is felt as a cost the moment it is
    // paid rather than noticed later on a meter.
    const t = Math.min(1, strainFor / 2.4)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = t * t * 0.22
    ctx.fillStyle = 'rgb(120, 170, 255)'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()

    vignette(ctx, width, height, t * 0.4, 'rgba(20, 40, 90, ALPHA)')
  }
}
