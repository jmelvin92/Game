import { describe, expect, it } from 'vitest'

import { createGrid } from '@/world/grid'
import { buildHouse, HOUSE_H, HOUSE_W } from '@/world/house'
import { deviceDef, Prop, propDef } from '@/world/props'
import { Tile } from '@/world/tiles'
import { Wall, WallSide } from '@/world/walls'

/**
 * The house is hand-authored data, and data rots differently from code: a
 * furniture edit that strands a doorway or an extra window that never got a
 * wall behind it will not fail a type check. These tests hold the plan to what
 * a house has to be.
 */
function built() {
  const grid = createGrid(HOUSE_W + 8, HOUSE_H + 8, Tile.Grass)
  buildHouse(grid, 4, 4, 1)
  return grid
}

describe('the house', () => {
  it('has exactly one front door in its shell', () => {
    const grid = built()
    let doors = 0

    for (let i = 0; i < HOUSE_W; i++) {
      if (grid.wallAt(4 + i, 4, WallSide.North) === Wall.Doorway) doors++
      if (grid.wallAt(4 + i, 4 + HOUSE_H, WallSide.North) === Wall.Doorway) doors++
    }
    for (let i = 0; i < HOUSE_H; i++) {
      if (grid.wallAt(4, 4 + i, WallSide.West) === Wall.Doorway) doors++
      if (grid.wallAt(4 + HOUSE_W, 4 + i, WallSide.West) === Wall.Doorway) doors++
    }

    expect(doors).toBe(1)
  })

  it('is divided into four rooms', () => {
    // Flood the interior treating every wall — doorways included — as a
    // divider: the number of pools is the number of rooms.
    const grid = built()
    const seen = new Set<string>()
    let rooms = 0

    for (let sy = 4; sy < 4 + HOUSE_H; sy++) {
      for (let sx = 4; sx < 4 + HOUSE_W; sx++) {
        const key = `${String(sx)},${String(sy)}`
        if (seen.has(key)) continue
        rooms++

        const queue = [[sx, sy]] as [number, number][]
        seen.add(key)
        while (queue.length > 0) {
          const [x, y] = queue.pop() ?? [0, 0]
          const step = (nx: number, ny: number, wx: number, wy: number, side: 0 | 1): void => {
            if (nx < 4 || ny < 4 || nx >= 4 + HOUSE_W || ny >= 4 + HOUSE_H) return
            const k = `${String(nx)},${String(ny)}`
            if (seen.has(k)) return
            if (grid.wallAt(wx, wy, side) !== Wall.None) return
            seen.add(k)
            queue.push([nx, ny])
          }
          step(x + 1, y, x + 1, y, WallSide.West)
          step(x - 1, y, x, y, WallSide.West)
          step(x, y + 1, x, y + 1, WallSide.North)
          step(x, y - 1, x, y, WallSide.North)
        }
      }
    }

    expect(rooms).toBe(4)
  })

  it('is furnished in every room', () => {
    const grid = built()
    let pieces = 0
    const kinds = new Set<number>()

    for (let y = 4; y < 4 + HOUSE_H; y++) {
      for (let x = 4; x < 4 + HOUSE_W; x++) {
        const prop = grid.propAt(x, y)
        if (prop === Prop.None) continue
        pieces++
        kinds.add(prop)
      }
    }

    expect(pieces).toBeGreaterThanOrEqual(18)
    expect(kinds.size).toBeGreaterThanOrEqual(14)
  })

  it('contains devices the gift can wake', () => {
    const grid = built()
    let devices = 0

    for (let y = 4; y < 4 + HOUSE_H; y++) {
      for (let x = 4; x < 4 + HOUSE_W; x++) {
        if (deviceDef(grid.propAt(x, y)) !== undefined) devices++
      }
    }

    // Two floor lamps, the television, the refrigerator.
    expect(devices).toBe(4)
  })

  it('keeps its doorways walkable', () => {
    // A doorway with a solid piece of furniture on either side of it is a door
    // in name only. Check the tiles both sides of every interior doorway.
    const grid = built()

    for (let y = 4; y <= 4 + HOUSE_H; y++) {
      for (let x = 4; x <= 4 + HOUSE_W; x++) {
        if (grid.wallAt(x, y, WallSide.West) === Wall.Doorway) {
          expect(propDef(grid.propAt(x, y)).solid, `east of door ${String(x)},${String(y)}`).toBe(
            false,
          )
          expect(
            propDef(grid.propAt(x - 1, y)).solid,
            `west of door ${String(x)},${String(y)}`,
          ).toBe(false)
        }
        if (grid.wallAt(x, y, WallSide.North) === Wall.Doorway) {
          expect(propDef(grid.propAt(x, y)).solid, `south of door ${String(x)},${String(y)}`).toBe(
            false,
          )
          expect(
            propDef(grid.propAt(x, y - 1)).solid,
            `north of door ${String(x)},${String(y)}`,
          ).toBe(false)
        }
      }
    }
  })

  it('roofs every tile, rising toward the ridge', () => {
    const grid = built()
    let flat = 0
    let risen = 0

    for (let y = 4; y < 4 + HOUSE_H; y++) {
      for (let x = 4; x < 4 + HOUSE_W; x++) {
        expect(grid.roofAt(x, y)).not.toBe(0)
        if (grid.roofHeightAt(x, y) === 0) flat++
        else risen++
      }
    }

    expect(flat).toBeGreaterThan(0)
    expect(risen).toBeGreaterThan(0)
  })
})
