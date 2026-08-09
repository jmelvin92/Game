import { describe, expect, it } from 'vitest'
import { depth, screenToWorld, TILE_H, TILE_W, worldToScreen } from '@/render/iso'

/**
 * The isometric transform underpins every pixel drawn and every mouse click
 * resolved. A subtle error here surfaces as "the art looks slightly wrong" rather
 * than as an exception, which is close to untraceable — so it is tested harder than
 * anything else in the codebase.
 */
describe('isometric projection', () => {
  it('places the origin at the screen origin', () => {
    expect(worldToScreen(0, 0)).toEqual({ sx: 0, sy: 0 })
  })

  it('separates the world axes onto opposite screen diagonals', () => {
    // +wx runs down-right, +wy runs down-left. If these were ever to agree in sign,
    // the world would render as a flat line rather than a diamond grid.
    expect(worldToScreen(1, 0)).toEqual({ sx: TILE_W / 2, sy: TILE_H / 2 })
    expect(worldToScreen(0, 1)).toEqual({ sx: -TILE_W / 2, sy: TILE_H / 2 })
  })

  it('moves a full tile down the screen along the grid diagonal', () => {
    expect(worldToScreen(1, 1)).toEqual({ sx: 0, sy: TILE_H })
  })

  it('raises height straight up the screen', () => {
    const ground = worldToScreen(3, 4, 0)
    const raised = worldToScreen(3, 4, 1)

    expect(raised.sx).toBe(ground.sx)
    expect(raised.sy).toBeLessThan(ground.sy)
  })

  it('round-trips exactly across the grid, including negative coordinates', () => {
    for (let wx = -40; wx <= 40; wx++) {
      for (let wy = -40; wy <= 40; wy++) {
        const { sx, sy } = worldToScreen(wx, wy)
        const back = screenToWorld(sx, sy)

        expect(back.wx).toBeCloseTo(wx, 10)
        expect(back.wy).toBeCloseTo(wy, 10)
      }
    }
  })

  it('round-trips fractional positions', () => {
    const points: readonly (readonly [number, number])[] = [
      [0.5, 0.5],
      [12.25, -3.75],
      [-7.125, 19.875],
    ]

    for (const [wx, wy] of points) {
      const { sx, sy } = worldToScreen(wx, wy)
      const back = screenToWorld(sx, sy)

      expect(back.wx).toBeCloseTo(wx, 10)
      expect(back.wy).toBeCloseTo(wy, 10)
    }
  })

  it('orders tiles back to front, so nearer tiles draw later', () => {
    expect(depth(0, 0)).toBeLessThan(depth(1, 0))
    expect(depth(1, 0)).toBeLessThan(depth(1, 1))
    // A tile the same distance away but taller draws after, covering the ground.
    expect(depth(2, 2, 0)).toBeLessThan(depth(2, 2, 1))
  })
})
