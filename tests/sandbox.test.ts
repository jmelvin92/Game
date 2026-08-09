import { describe, expect, it } from 'vitest'

import {
  createSandbox,
  HOUSES,
  LAMP_COUNT,
  SANDBOX_HEIGHT,
  SANDBOX_WIDTH,
  SPAWN,
} from '@/world/sandbox'
import { Prop } from '@/world/props'
import { isSolid, Tile } from '@/world/tiles'
import { blocksMovement, WallSide } from '@/world/walls'

/**
 * Properties of the workshop block. Small world, small invariants — but the
 * ones that matter are the same ones the island had: everything walkable is
 * one connected place, and what the plan promises is what the grid holds.
 */
const grid = createSandbox()

describe('the block', () => {
  it('is the right size', () => {
    expect(grid.width).toBe(SANDBOX_WIDTH)
    expect(grid.height).toBe(SANDBOX_HEIGHT)
  })

  it('holds exactly the six houses', () => {
    const ids = new Set<number>()
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const b = grid.buildingAt(x, y)
        if (b !== 0) ids.add(b)
      }
    }
    expect(ids.size).toBe(HOUSES)
  })

  it('holds exactly the five lamps', () => {
    let lamps = 0
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.propAt(x, y) === Prop.LampPost) lamps++
      }
    }
    expect(lamps).toBe(LAMP_COUNT)
  })

  it('runs streets with pavements', () => {
    let road = 0
    let pavement = 0
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.at(x, y) === Tile.Road) road++
        if (grid.at(x, y) === Tile.Sidewalk) pavement++
      }
    }
    expect(road).toBeGreaterThan(0)
    expect(pavement).toBeGreaterThan(0)
  })

  it('spawns the player on walkable ground facing a front path', () => {
    const tile = grid.at(Math.floor(SPAWN.x), Math.floor(SPAWN.y))
    expect(isSolid(tile)).toBe(false)
    expect(grid.buildingAt(Math.floor(SPAWN.x), Math.floor(SPAWN.y))).toBe(0)
  })

  it('leaves everywhere reachable from the spawn', () => {
    // The same flood the island had, over the same rules movement uses. Six
    // hand-placed houses can still seal something between them.
    const reached = new Uint8Array(grid.width * grid.height)
    const queue: number[] = [Math.floor(SPAWN.y) * grid.width + Math.floor(SPAWN.x)]
    reached[queue[0] ?? 0] = 1
    let count = 0

    while (queue.length > 0) {
      const index = queue.pop() ?? 0
      const x = index % grid.width
      const y = (index - x) / grid.width
      count++

      const step = (nx: number, ny: number, wallX: number, wallY: number, side: 0 | 1): void => {
        if (!grid.contains(nx, ny)) return
        const ni = ny * grid.width + nx
        if (reached[ni] === 1) return
        if (isSolid(grid.at(nx, ny))) return
        if (blocksMovement(grid.wallAt(wallX, wallY, side))) return
        reached[ni] = 1
        queue.push(ni)
      }

      step(x + 1, y, x + 1, y, WallSide.West)
      step(x - 1, y, x, y, WallSide.West)
      step(x, y + 1, x, y + 1, WallSide.North)
      step(x, y - 1, x, y, WallSide.North)
    }

    let walkable = 0
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!isSolid(grid.at(x, y))) walkable++
      }
    }

    expect(count).toBe(walkable)
  })
})
