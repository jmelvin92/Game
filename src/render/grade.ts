/**
 * Colour grading.
 *
 * The art in this game comes from five sources — two tile packs, a facade pack,
 * shapes drawn in code, and a generated character. Each was made to its own
 * palette, its own contrast, its own idea of what grey is, and no amount of work on
 * any one of them fixes that. What does fix it is putting the whole frame through
 * one process at the end, so everything is finally lit by the same light.
 *
 * That is most of the difference between art that looks assembled and art that
 * looks shot.
 *
 * Everything here is done with composite operations over the whole frame rather
 * than by touching pixels. A per-pixel pass at this resolution would cost more than
 * the entire rest of the renderer; these are a handful of full-screen fills, which
 * the browser hands to the GPU.
 */

export interface Grade {
  /** Pulls every source toward a common palette. The single most useful control. */
  desaturate: number
  /** Deepens and cools the darks. */
  shadowTint: string
  shadowStrength: number
  /** Warms the lights. Together with cool shadows this is what reads as "graded". */
  highlightTint: string
  highlightStrength: number
  /** Separates the midtones so the picture stops looking flat. */
  contrast: number
  /** Darkens the corners. Frames the picture and hides the edge of the world. */
  vignette: number
}

/**
 * A starting point, deliberately restrained.
 *
 * Grading is very easy to overdo — the result looks striking for a minute and
 * unpleasant for an hour. These numbers are meant to be felt rather than seen. They
 * are exposed on the dev handle so they can be dialled while looking at the game
 * rather than guessed at here.
 */
export function createGrade(): Grade {
  return {
    desaturate: 0.22,
    shadowTint: 'rgb(46, 62, 92)',
    shadowStrength: 0.3,
    highlightTint: 'rgb(255, 222, 176)',
    highlightStrength: 0.16,
    contrast: 0.14,
    vignette: 0.34,
  }
}

/**
 * @param daylight 0 in full dark through to 1 at midday
 *
 * Several of these controls only make sense on a lit picture. Deepening the darks
 * and darkening the corners are corrections for a scene that has highlights to
 * balance against; at night there are none, and applying them anyway just crushes
 * an already-black frame into something unreadable. They fade out with the light.
 *
 * Desaturation and the warm highlight do not fade. Cohesion is worth as much at
 * night as during the day, and the highlight lands on the lamps, which is exactly
 * where a little warmth is wanted.
 */
export function applyGrade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  grade: Grade,
  daylight = 1,
): void {
  // Never all the way off: a trace keeps the transition through dusk from
  // showing a seam where the grade stops.
  const lit = 0.12 + daylight * 0.88
  // Desaturation first, before anything adds colour back. Five palettes disagreeing
  // is a saturation problem more than a hue one: drain them a little and they stop
  // arguing, and the tints below then put a single agreed colour back on top.
  if (grade.desaturate > 0.002) {
    ctx.save()
    ctx.globalCompositeOperation = 'saturation'
    ctx.globalAlpha = grade.desaturate
    ctx.fillStyle = 'hsl(0, 0%, 50%)'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  // Cool the darks. Multiply only bites where the picture is already dark, which
  // is exactly where shadow tint belongs.
  if (grade.shadowStrength * lit > 0.002) {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = grade.shadowStrength * lit
    ctx.fillStyle = grade.shadowTint
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  // Warm the lights. Screen only bites where it is already bright, so this lands
  // on the highlights without touching the shadows just tinted the other way.
  // Warm light against cool shade is the oldest trick there is and still the one
  // that does the most.
  if (grade.highlightStrength > 0.002) {
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = grade.highlightStrength
    ctx.fillStyle = grade.highlightTint
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  // Push the midtones apart. Multiply and screen both pull toward the middle, so
  // without this the frame comes out softer than it started.
  if (grade.contrast * lit > 0.002) {
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    ctx.globalAlpha = grade.contrast * lit
    ctx.fillStyle = 'rgb(128, 132, 144)'
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  // Corners last. Beyond framing the picture, it hides the hard edge where the
  // map runs out, which is otherwise one of the more obvious tells.
  if (grade.vignette * lit > 0.002) {
    const cx = width / 2
    const cy = height / 2
    const outer = Math.hypot(cx, cy)

    const gradient = ctx.createRadialGradient(cx, cy, outer * 0.42, cx, cy, outer)
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
    gradient.addColorStop(1, `rgba(6, 8, 16, ${String(grade.vignette * lit)})`)

    ctx.save()
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }
}
