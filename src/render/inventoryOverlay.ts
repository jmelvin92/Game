import type { Inventory } from '@/entity/inventory'
import { isEmpty } from '@/entity/inventory'

/**
 * The backpack panel.
 *
 * An overlay, not a screen: the world keeps running behind it, dimmed a little
 * so the panel reads. That is a survival decision as much as a visual one —
 * rummaging through a bag with something in the dark nearby should cost the
 * time it costs.
 *
 * Items have no art yet, so an occupied slot draws a placeholder chip and its
 * count. The layout is finished; the contents arrive with loot.
 */

const COLUMNS = 4
const ROWS = 3
const CELL = 56
const GAP = 8
const PADDING = 18
const TITLE_BAND = 40

export function renderInventory(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  inventory: Inventory,
): void {
  // Dim the world so the panel is unmistakably in front of it.
  ctx.fillStyle = 'rgba(4, 6, 10, 0.45)'
  ctx.fillRect(0, 0, width, height)

  const panelW = PADDING * 2 + COLUMNS * CELL + (COLUMNS - 1) * GAP
  const panelH = PADDING * 2 + TITLE_BAND + ROWS * CELL + (ROWS - 1) * GAP
  const panelX = Math.round((width - panelW) / 2)
  const panelY = Math.round((height - panelH) / 2)

  ctx.fillStyle = 'rgba(14, 16, 22, 0.94)'
  ctx.fillRect(panelX, panelY, panelW, panelH)
  ctx.strokeStyle = 'rgba(150, 158, 170, 0.35)'
  ctx.lineWidth = 1
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1)

  ctx.textBaseline = 'top'
  ctx.font = '15px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillStyle = '#e8eaee'
  ctx.fillText('BACKPACK', panelX + PADDING, panelY + PADDING)

  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillStyle = '#8a919c'
  ctx.fillText('tab to close', panelX + panelW - PADDING - 74, panelY + PADDING + 3)

  const gridX = panelX + PADDING
  const gridY = panelY + PADDING + TITLE_BAND

  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const x = gridX + column * (CELL + GAP)
      const y = gridY + row * (CELL + GAP)
      const slot = inventory.slots[row * COLUMNS + column]

      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.fillRect(x, y, CELL, CELL)
      ctx.strokeStyle = 'rgba(150, 158, 170, 0.22)'
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1)

      if (slot === null || slot === undefined) continue

      // Placeholder chip until items bring their own art: hue keyed off the
      // item id, so different items are at least tellable apart.
      ctx.fillStyle = `hsl(${String((slot.item * 47) % 360)}, 28%, 42%)`
      ctx.fillRect(x + 10, y + 10, CELL - 20, CELL - 20)

      if (slot.count > 1) {
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
        ctx.fillStyle = '#e8eaee'
        ctx.fillText(String(slot.count), x + CELL - 16, y + CELL - 16)
      }
    }
  }

  if (isEmpty(inventory)) {
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = '#6d747e'
    const message = 'nothing yet — the world is out there'
    const measured = ctx.measureText(message).width
    ctx.fillText(message, Math.round((width - measured) / 2), gridY + ROWS * (CELL + GAP) + 6)
  }
}
