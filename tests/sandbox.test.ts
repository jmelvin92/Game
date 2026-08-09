import { describe, expect, it } from 'vitest'

import { createSandbox, SANDBOX_HEIGHT, SANDBOX_WIDTH, SPAWN } from '@/world/sandbox'
import { Prop } from '@/world/props'
import { isSolid, Tile } from '@/world/tiles'
import { blocksMovement, WallSide } from '@/world/walls'

/**
 * Properties of the finished island. Generated once and inspected, because these
 * are facts about the whole world rather than any function in it — and most of
 * them guard against quiet regressions: a noise change that drowns the city, a
 * fence that seals a district, a building stamped into the sea.
 */
const grid = createSandbox()

describe('the island', () => {
  it('is the right size', () => {
    expect(grid.width).toBe(SANDBOX_WIDTH)
    expect(grid.height).toBe(SANDBOX_HEIGHT)
  })

  it('is surrounded by open sea', () => {
    for (let i = 0; i < grid.width; i++) {
      expect(grid.at(i, 0)).toBe(Tile.Water)
      expect(grid.at(i, grid.height - 1)).toBe(Tile.Water)
      expect(grid.at(0, i)).toBe(Tile.Water)
      expect(grid.at(grid.width - 1, i)).toBe(Tile.Water)
    }
  })

  it('keeps every building on dry land', () => {
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.buildingAt(x, y) === 0) continue
        expect(grid.at(x, y), `building floor at ${String(x)},${String(y)}`).not.toBe(Tile.Water)
      }
    }
  })

  it('has a substantial amount of land and of sea', () => {
    let water = 0
    for (let y = 0; y < grid.height; y += 2) {
      for (let x = 0; x < grid.width; x += 2) {
        if (grid.at(x, y) === Tile.Water) water++
      }
    }
    const fraction = water / ((grid.width / 2) * (grid.height / 2))
    expect(fraction).toBeGreaterThan(0.25)
    expect(fraction).toBeLessThan(0.65)
  })

  it('varies its ground', () => {
    const seen = new Set<number>()
    for (let y = 0; y < grid.height; y += 3) {
      for (let x = 0; x < grid.width; x += 3) {
        seen.add(grid.at(x, y))
      }
    }
    // Sea, beach, grass, road, pavement, concrete, sand or rock, soil: an island
    // that lost one of these lost a biome or a settlement.
    for (const tile of [
      Tile.Water,
      Tile.Sand,
      Tile.Grass,
      Tile.Road,
      Tile.Sidewalk,
      Tile.Concrete,
      Tile.Soil,
    ]) {
      expect(seen.has(tile), `no ${String(tile)} tile found`).toBe(true)
    }
  })
})

describe('getting around', () => {
  it('spawns the player on walkable ground', () => {
    const tile = grid.at(Math.floor(SPAWN.x), Math.floor(SPAWN.y))
    expect(isSolid(tile)).toBe(false)
    expect(grid.buildingAt(Math.floor(SPAWN.x), Math.floor(SPAWN.y))).toBe(0)
  })

  it('leaves the whole island connected', () => {
    // Flood fill from the spawn, crossing tile edges only where no solid wall
    // stands on the boundary — the same rule movement enforces. Anywhere land
    // this cannot reach is somewhere a fence or a building sealed off.
    const reached = new Uint8Array(grid.width * grid.height)
    const queue: number[] = [Math.floor(SPAWN.y) * grid.width + Math.floor(SPAWN.x)]
    reached[queue[0] ?? 0] = 1
    let count = 0

    while (queue.length > 0) {
      const index = queue.pop() ?? 0
      const x = index % grid.width
      const y = (index - x) / grid.width
      count++

      const step = (nx: number, ny: number, wallX: number, wallY: number, side: number): void => {
        if (!grid.contains(nx, ny)) return
        const ni = ny * grid.width + nx
        if (reached[ni] === 1) return
        if (isSolid(grid.at(nx, ny))) return
        if (blocksMovement(grid.wallAt(wallX, wallY, side as 0 | 1))) return
        reached[ni] = 1
        queue.push(ni)
      }

      step(x + 1, y, x + 1, y, WallSide.West)
      step(x - 1, y, x, y, WallSide.West)
      step(x, y + 1, x, y + 1, WallSide.North)
      step(x, y - 1, x, y, WallSide.North)
    }

    let land = 0
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (!isSolid(grid.at(x, y))) land++
      }
    }

    // Interiors behind doors count as reachable (doorways do not block), so the
    // bar is high: nearly all walkable ground must be one connected place.
    expect(count / land).toBeGreaterThan(0.95)
  })

  it('reaches both airfields and the second town by land', () => {
    // Walk a straight sample of destinations rather than repeating the fill:
    // concrete at both airfield sites, and road at the town's centre.
    const spots = [
      { name: 'city airfield', x: 700, y: 680, tile: Tile.Concrete },
      { name: 'rural airfield', x: 300, y: 212, tile: Tile.Concrete },
      { name: 'town crossroads', x: 430, y: 300, tile: Tile.Road },
    ]
    for (const spot of spots) {
      let found = false
      for (let dy = -20; dy <= 20 && !found; dy++) {
        for (let dx = -20; dx <= 20 && !found; dx++) {
          if (grid.at(spot.x + dx, spot.y + dy) === spot.tile) found = true
        }
      }
      expect(found, `${spot.name} missing`).toBe(true)
    }
  })
})

describe('the settlements', () => {
  it('built a city worth the name', () => {
    const ids = new Set<number>()
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const b = grid.buildingAt(x, y)
        if (b !== 0) ids.add(b)
      }
    }
    expect(ids.size).toBeGreaterThan(120)
  })

  it('lit some streets and left most dark', () => {
    let lamps = 0
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.propAt(x, y) === Prop.LampPost) lamps++
      }
    }
    expect(lamps).toBeGreaterThan(8)
    expect(lamps).toBeLessThan(220)
  })
})
