import type { Inventory } from '@/entity/inventory'
import { BACKPACK_SLOTS, isEmpty } from '@/entity/inventory'

/**
 * The backpack panel.
 *
 * An overlay, not a screen: the world keeps running behind it, dimmed a little
 * so the panel reads. Rummaging through a bag with something in the dark nearby
 * should cost the time it costs.
 *
 * The look is field gear, not glass: worn canvas over a dark well, stitching
 * inside the edge, riveted corners. Flat rectangles with hairline strokes read
 * as a debug tool — this is meant to read as a thing the character owns. All of
 * it is drawn, none of it is asset: the same rule as the lamps and the wrecks,
 * so it grades and lights like everything else.
 */

const COLUMNS = 4
const ROWS = 3
const CELL = 58
const GAP = 10
const PADDING = 22
const TITLE_BAND = 46
const FOOTER = 34

/**
 * Film grain, generated once. Noise is most of the difference between a surface
 * and a fill — a few hundred alpha specks stop the panel looking vector-drawn.
 */
let grain: CanvasPattern | null | undefined

function grainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grain !== undefined) return grain

  const tile = document.createElement('canvas')
  tile.width = 96
  tile.height = 96
  const g = tile.getContext('2d')
  if (g === null) {
    grain = null
    return grain
  }

  let seed = 0x6c62272e
  const random = (): number => {
    seed = Math.imul(seed ^ (seed >>> 15), 0x2545f491)
    return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296
  }

  for (let i = 0; i < 520; i++) {
    const light = random() > 0.5
    g.fillStyle = light ? 'rgba(224, 214, 190, 0.05)' : 'rgba(0, 0, 0, 0.09)'
    g.fillRect(random() * 96, random() * 96, 1, 1)
  }

  grain = ctx.createPattern(tile, 'repeat')
  return grain
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** A small dome-headed rivet. The highlight is what sells the dome. */
function rivet(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const glow = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, 4)
  glow.addColorStop(0, '#9a8f79')
  glow.addColorStop(0.55, '#5b5347')
  glow.addColorStop(1, '#2e2a24')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, 3.5, 0, Math.PI * 2)
  ctx.fill()
}

/** Letter-spaced caps, drawn by hand because canvas has no letter-spacing. */
function spacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
): number {
  let at = x
  for (const letter of text) {
    ctx.fillText(letter, at, y)
    at += ctx.measureText(letter).width + spacing
  }
  return at - spacing
}

/**
 * @param progress 0 closed through 1 fully open; the panel scales and fades in,
 *   because UI that pops into existence reads as a glitch and UI that arrives
 *   reads as intended
 */
export function renderInventory(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  inventory: Inventory,
  progress = 1,
): void {
  const eased = 1 - (1 - progress) ** 3

  // Dim the world so the panel is unmistakably in front of it.
  ctx.fillStyle = `rgba(4, 6, 10, ${String(0.5 * eased)})`
  ctx.fillRect(0, 0, width, height)

  const panelW = PADDING * 2 + COLUMNS * CELL + (COLUMNS - 1) * GAP
  const panelH = PADDING * 2 + TITLE_BAND + ROWS * CELL + (ROWS - 1) * GAP + FOOTER

  ctx.save()
  ctx.globalAlpha = eased
  // Scale about the panel's centre: it grows into place rather than appearing.
  ctx.translate(width / 2, height / 2)
  ctx.scale(0.94 + 0.06 * eased, 0.94 + 0.06 * eased)
  ctx.translate(-panelW / 2, -panelH / 2)

  // Thrown shadow, so the panel sits above the world rather than on it.
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
  ctx.shadowBlur = 26
  ctx.shadowOffsetY = 10

  // Canvas-cloth body: a vertical fall of light, slightly warm, like the grade.
  const cloth = ctx.createLinearGradient(0, 0, 0, panelH)
  cloth.addColorStop(0, '#3a3831')
  cloth.addColorStop(0.12, '#33312b')
  cloth.addColorStop(1, '#242320')
  ctx.fillStyle = cloth
  roundedRect(ctx, 0, 0, panelW, panelH, 10)
  ctx.fill()
  ctx.restore()

  const pattern = grainPattern(ctx)
  if (pattern !== null) {
    ctx.fillStyle = pattern
    roundedRect(ctx, 0, 0, panelW, panelH, 10)
    ctx.fill()
  }

  // Leather binding: a darker outer edge, then stitching just inside it.
  ctx.strokeStyle = '#191713'
  ctx.lineWidth = 3
  roundedRect(ctx, 1.5, 1.5, panelW - 3, panelH - 3, 9)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(196, 178, 138, 0.28)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  roundedRect(ctx, 7.5, 7.5, panelW - 15, panelH - 15, 6)
  ctx.stroke()
  ctx.setLineDash([])

  rivet(ctx, 14, 14)
  rivet(ctx, panelW - 14, 14)
  rivet(ctx, 14, panelH - 14)
  rivet(ctx, panelW - 14, panelH - 14)

  // Title band.
  ctx.textBaseline = 'top'
  ctx.font = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillStyle = '#ddd5c4'
  spacedText(ctx, 'BACKPACK', PADDING, PADDING - 2, 5)

  const used = inventory.slots.filter((slot) => slot !== null).length
  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillStyle = '#8d8677'
  const usage = `${String(used)} / ${String(BACKPACK_SLOTS)}`
  ctx.fillText(usage, panelW - PADDING - ctx.measureText(usage).width, PADDING + 1)

  // Divider under the title: bright in the middle, gone at the ends.
  const divider = ctx.createLinearGradient(PADDING, 0, panelW - PADDING, 0)
  divider.addColorStop(0, 'rgba(196, 178, 138, 0)')
  divider.addColorStop(0.5, 'rgba(196, 178, 138, 0.35)')
  divider.addColorStop(1, 'rgba(196, 178, 138, 0)')
  ctx.fillStyle = divider
  ctx.fillRect(PADDING, PADDING + 24, panelW - PADDING * 2, 1)

  // Slot wells.
  const gridX = PADDING
  const gridY = PADDING + TITLE_BAND

  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const x = gridX + column * (CELL + GAP)
      const y = gridY + row * (CELL + GAP)
      const slot = inventory.slots[row * COLUMNS + column]

      // The well: darker than the cloth, lit faintly from below its top edge,
      // which is what makes it read as sunk into the panel instead of printed.
      const well = ctx.createLinearGradient(0, y, 0, y + CELL)
      well.addColorStop(0, '#171613')
      well.addColorStop(0.18, '#1d1c18')
      well.addColorStop(1, '#232119')
      ctx.fillStyle = well
      roundedRect(ctx, x, y, CELL, CELL, 6)
      ctx.fill()

      // Inner shadow at the top, inner light at the bottom: the two lines that
      // do all the bevelling.
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + 5, y + 1.5)
      ctx.lineTo(x + CELL - 5, y + 1.5)
      ctx.stroke()

      ctx.strokeStyle = 'rgba(196, 178, 138, 0.1)'
      ctx.beginPath()
      ctx.moveTo(x + 5, y + CELL - 1)
      ctx.lineTo(x + CELL - 5, y + CELL - 1)
      ctx.stroke()

      if (slot === null || slot === undefined) continue

      // Placeholder chip until items bring their own art: hue keyed off the
      // item id, with a soft shadow and a gloss so it sits *in* the well.
      const hue = (slot.item * 47) % 360
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetY = 3
      ctx.fillStyle = `hsl(${String(hue)}, 26%, 40%)`
      roundedRect(ctx, x + 11, y + 11, CELL - 22, CELL - 22, 5)
      ctx.fill()
      ctx.restore()

      const gloss = ctx.createLinearGradient(0, y + 11, 0, y + CELL / 2)
      gloss.addColorStop(0, 'rgba(255, 255, 255, 0.18)')
      gloss.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = gloss
      roundedRect(ctx, x + 11, y + 11, CELL - 22, (CELL - 22) / 2, 5)
      ctx.fill()

      if (slot.count > 1) {
        // Count in a pill, bottom-right of the well.
        const label = String(slot.count)
        ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace'
        const w = ctx.measureText(label).width + 10
        ctx.fillStyle = 'rgba(10, 9, 7, 0.85)'
        roundedRect(ctx, x + CELL - w - 4, y + CELL - 20, w, 15, 7)
        ctx.fill()
        ctx.fillStyle = '#e6dfd0'
        ctx.fillText(label, x + CELL - w + 1, y + CELL - 18)
      }
    }
  }

  // Footer: the hint, and the empty-bag line when it applies.
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillStyle = '#6d675a'
  const hint = 'TAB  close'
  ctx.fillText(hint, Math.round((panelW - ctx.measureText(hint).width) / 2), panelH - FOOTER + 10)

  if (isEmpty(inventory)) {
    // A watermark across the middle of the grid: the empty state should be
    // where the eye looks for contents, not tucked into a margin.
    ctx.font = 'italic 12px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(160, 152, 134, 0.5)'
    const message = 'nothing yet — the world is out there'
    ctx.fillText(
      message,
      Math.round((panelW - ctx.measureText(message).width) / 2),
      gridY + Math.round((ROWS * CELL + (ROWS - 1) * GAP) / 2) - 6,
    )
  }

  ctx.restore()
}
