import type { Grid } from '@/world/grid'
import { propLight } from '@/world/props'

/**
 * How brightly lit a place is, as the simulation understands it.
 *
 * Separate from anything in `render/`, and deliberately so. The renderer's lights
 * are screen positions with gradients and colours; this answers a different
 * question — *is this spot safe* — and the answer has to be the same whether or not
 * anything is being drawn.
 *
 * Only charged devices count. The player's torch is not protection: it is
 * directional, weak, and carried, and if it warded anything off there would be no
 * reason to ever spend the gift. It lets you see. It does not keep you safe.
 */

/** Tiles beyond a device's own radius where its light still counts for anything. */
const FALLOFF_MARGIN = 0.5

export function illuminationAt(grid: Grid, x: number, y: number): number {
  let brightest = 0

  // Devices reach a handful of tiles at most, so a small window around the point
  // covers everything that could possibly light it.
  const reach = 9
  const minX = Math.floor(x) - reach
  const maxX = Math.floor(x) + reach
  const minY = Math.floor(y) - reach
  const maxY = Math.floor(y) + reach

  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (grid.chargeAt(tx, ty) <= 0) continue

      const emitted = propLight(grid.propAt(tx, ty))
      if (emitted === undefined) continue

      const distance = Math.hypot(tx + 0.5 - x, ty + 0.5 - y)
      const range = emitted.radius + FALLOFF_MARGIN
      if (distance >= range) continue

      // Linear rather than the renderer's inverse-square curve: this decides
      // whether somewhere is safe, and a threshold wants a predictable edge
      // rather than a long invisible tail.
      brightest = Math.max(brightest, (1 - distance / range) * emitted.strength)
    }
  }

  return brightest
}

/** Above this, a place counts as lit and the things in the dark cannot hold there. */
export const SAFE_LIGHT = 0.18

export function isLit(grid: Grid, x: number, y: number): boolean {
  return illuminationAt(grid, x, y) >= SAFE_LIGHT
}
