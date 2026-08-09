/**
 * Showing the health slots without a health bar.
 *
 * The world still reports its own state first: loaning slots out closes the
 * edges of the vision in and drains the colour, exactly as losing health used
 * to — being mostly lent out should *feel* thin. A row of slot pips is the one
 * concession to readout, because a discrete resource the player allocates
 * deliberately has to be countable at a glance, and five diamonds are cheaper
 * to read than a vignette is to estimate.
 */

export interface VitalsView {
  /** Slots owned. */
  readonly total: number
  /** Slots out on loan to burning devices. */
  readonly loaned: number
  /** Seconds left on the channelling after-effect. */
  readonly strainFor: number
}

/** Free fraction at which the edges begin to close in. */
const VISIBLE_BELOW = 0.75

/** Free fraction at which the vignette starts to pulse. */
const PULSE_BELOW = 0.4

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

/** One slot pip: a small diamond, in one of three states. */
function pip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  state: 'free' | 'loaned',
  time: number,
): void {
  const r = 7

  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r, y)
  ctx.closePath()

  if (state === 'free') {
    ctx.fillStyle = '#d8d2c2'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
    return
  }

  // Loaned: the slot is out there burning in a lamp somewhere, so its pip is
  // hollow with an ember in it, breathing slowly — alive, just not here.
  ctx.strokeStyle = 'rgba(216, 210, 194, 0.5)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  const breathe = 0.55 + Math.sin(time * 2.1 + x * 0.3) * 0.2
  ctx.fillStyle = `rgba(255, 184, 100, ${String(breathe)})`
  ctx.beginPath()
  ctx.arc(x, y, 2.6, 0, Math.PI * 2)
  ctx.fill()
}

export function renderVitals(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  vitals: VitalsView,
  time: number,
  /** Seconds left on the cue that fires when something first notices you. */
  noticed = 0,
): void {
  const { total, loaned, strainFor } = vitals
  const free = Math.max(0, total - loaned)
  const fraction = total > 0 ? free / total : 0

  if (fraction < VISIBLE_BELOW) {
    const thin = (VISIBLE_BELOW - fraction) / VISIBLE_BELOW

    // Down to the last free bar the vignette beats — the body objecting to how
    // much of it is elsewhere. No number needed to know it is nearly all out.
    let pulse = 0
    if (fraction < PULSE_BELOW) {
      const urgency = 1 - fraction / PULSE_BELOW
      const beat = Math.sin(time * (5 + urgency * 5))
      pulse = Math.max(0, beat) * 0.16 * urgency
    }

    vignette(ctx, width, height, thin * 0.85 + pulse, 'rgba(48, 4, 8, ALPHA)')

    // Colour drains as well as darkens. Losing saturation reads as fading
    // rather than as being in a red room.
    ctx.save()
    ctx.globalCompositeOperation = 'saturation'
    ctx.globalAlpha = Math.min(0.75, thin * 0.9)
    ctx.fillStyle = 'hsl(0, 0%, 50%)'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  if (noticed > 0) {
    // Being hunted should be knowable at the moment it starts, not discovered
    // when something is already on you. A brief closing of the edges, distinct
    // from the health vignette by being colder and far quicker to fade.
    const t = Math.min(1, noticed / 1.6)
    vignette(ctx, width, height, t * t * 0.7, 'rgba(10, 10, 16, ALPHA)')
  }

  if (strainFor > 0) {
    // A cold flare that fades, so channelling is felt as a cost the moment it
    // is paid rather than noticed later on a meter.
    const t = Math.min(1, strainFor / 2.4)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = t * t * 0.22
    ctx.fillStyle = 'rgb(120, 170, 255)'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()

    vignette(ctx, width, height, t * 0.4, 'rgba(20, 40, 90, ALPHA)')
  }

  // The slot row, bottom centre, out of the world's way.
  const gap = 22
  const rowWidth = (total - 1) * gap
  const startX = Math.round(width / 2 - rowWidth / 2)
  const y = height - 26

  for (let i = 0; i < total; i++) {
    // Loaned slots empty from the right, so the row reads left-to-right as
    // "what I still have".
    pip(ctx, startX + i * gap, y, i < free ? 'free' : 'loaned', time)
  }
}
