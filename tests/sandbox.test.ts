import { describe, expect, it } from 'vitest'

import { createSandbox, SANDBOX_HEIGHT, SANDBOX_WIDTH, SPAWN, TOWN_TOP } from '@/world/sandbox'
import { Tile } from '@/world/tiles'

/**
 * The countryside is defined by an absence — no buildings, no street lighting — and
 * an absence is exactly the kind of thing that comes back without anyone noticing.
 * A generator change three months from now that starts placing lots one block too
 * far north would look fine in a screenshot of the town and would quietly undo the
 * only thing the country was for.
 *
 * The map is generated once and inspected, rather than tested a piece at a time,
 * because these are properties of the finished world.
 */
const grid = createSandbox()

describe('the countryside', () => {
  it('extends the map north of the town', () => {
    expect(grid.width).toBe(SANDBOX_WIDTH)
    expect(grid.height).toBe(SANDBOX_HEIGHT)
    expect(TOWN_TOP).toBeGreaterThan(0)
    expect(TOWN_TOP).toBeLessThan(SANDBOX_HEIGHT)
  })

  it('has no buildings in it', () => {
    for (let y = 0; y < TOWN_TOP; y++) {
      for (let x = 0; x < grid.width; x++) {
        expect(grid.buildingAt(x, y)).toBe(0)
      }
    }
  })

  it('has no street lighting in it', () => {
    // Props are allowed — trees and scrub belong out here. Lamp posts do not.
    for (let y = 0; y < TOWN_TOP; y++) {
      for (let x = 0; x < grid.width; x++) {
        expect(grid.at(x, y)).not.toBe(Tile.Sidewalk)
      }
    }
  })

  it('is reachable from town by road', () => {
    // The highway is the thread back to town in the dark. If it ever stops being
    // continuous the country becomes somewhere you get lost rather than somewhere
    // you go, so every row between the top of the map and the town must carry it.
    for (let y = 0; y < TOWN_TOP; y++) {
      let road = false
      for (let x = 0; x < grid.width && !road; x++) {
        if (grid.at(x, y) === Tile.Road) road = true
      }
      expect(road, `no road on row ${String(y)}`).toBe(true)
    }
  })
})

describe('the town', () => {
  it('still gets built', () => {
    let buildings = 0
    for (let y = TOWN_TOP; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.buildingAt(x, y) !== 0) buildings++
      }
    }
    expect(buildings).toBeGreaterThan(0)
  })

  it('spawns the player on solid ground inside it', () => {
    expect(SPAWN.y).toBeGreaterThan(TOWN_TOP)
    expect(SPAWN.y).toBeLessThan(SANDBOX_HEIGHT)
    expect(SPAWN.x).toBeGreaterThan(0)
    expect(SPAWN.x).toBeLessThan(SANDBOX_WIDTH)
  })
})
