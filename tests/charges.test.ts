import { describe, expect, it } from 'vitest'

import { createGrid, drainCharges } from '@/world/grid'
import { Tile } from '@/world/tiles'

/**
 * Charges are stored in the tile array but found through an index of which tiles
 * are lit, so that running them down does not mean reading the whole map every
 * frame. Two representations of one fact can drift apart, and the failure is a
 * quiet one — a lamp that never goes out, or one that never drains — so the index
 * agreeing with the array is worth asserting directly.
 */

function grid() {
  return createGrid(32, 32, Tile.Grass)
}

describe('charges', () => {
  it('are found without reading the map', () => {
    const g = grid()
    expect(g.charged().size).toBe(0)

    g.setCharge(4, 7, 12)
    expect(g.charged().size).toBe(1)
    expect(g.chargeAt(4, 7)).toBeCloseTo(12)
  })

  it('leave the index when they run out', () => {
    const g = grid()
    g.setCharge(4, 7, 1)

    drainCharges(g, 0.6)
    expect(g.charged().size).toBe(1)
    expect(g.chargeAt(4, 7)).toBeCloseTo(0.4)

    drainCharges(g, 0.6)
    expect(g.chargeAt(4, 7)).toBe(0)
    expect(g.charged().size).toBe(0)
  })

  it('leave the index when cleared outright', () => {
    const g = grid()
    g.setCharge(1, 1, 30)
    g.setCharge(1, 1, 0)
    expect(g.charged().size).toBe(0)
  })

  it('drain every lit tile and no others', () => {
    const g = grid()
    g.setCharge(2, 2, 10)
    g.setCharge(9, 14, 10)
    g.setCharge(30, 3, 4)

    drainCharges(g, 1)

    expect(g.chargeAt(2, 2)).toBeCloseTo(9)
    expect(g.chargeAt(9, 14)).toBeCloseTo(9)
    expect(g.chargeAt(30, 3)).toBeCloseTo(3)
    expect(g.chargeAt(5, 5)).toBe(0)
    expect(g.charged().size).toBe(3)
  })

  it('recover the right tile from an index on a non-square map', () => {
    // The index has to be unpacked with the grid's width, and a square test map
    // would pass whichever way round it was done.
    const g = createGrid(64, 16, Tile.Grass)
    g.setCharge(50, 9, 5)

    drainCharges(g, 1)

    expect(g.chargeAt(50, 9)).toBeCloseTo(4)
    expect(g.chargeAt(9, 50)).toBe(0)
  })

  it('ignore charges set outside the map', () => {
    const g = grid()
    g.setCharge(-1, 5, 10)
    g.setCharge(99, 5, 10)
    expect(g.charged().size).toBe(0)
  })
})
