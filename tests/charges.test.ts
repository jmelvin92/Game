import { describe, expect, it } from 'vitest'

import { createGrid } from '@/world/grid'
import { Tile } from '@/world/tiles'

/**
 * Lit devices are how loaned health slots are counted — a lit tile IS a loan —
 * so the index of burning tiles has to be exactly right: a stale entry is a
 * health slot the player can never get back, and a missing one is free light.
 */

function grid() {
  return createGrid(32, 32, Tile.Grass)
}

describe('the lit index', () => {
  it('starts empty', () => {
    expect(grid().charged().size).toBe(0)
  })

  it('counts a device the moment it lights', () => {
    const g = grid()
    g.setCharge(4, 7, 1)

    expect(g.charged().size).toBe(1)
    expect(g.chargeAt(4, 7)).toBeGreaterThan(0)
  })

  it('releases it the moment it goes dark', () => {
    const g = grid()
    g.setCharge(4, 7, 1)
    g.setCharge(4, 7, 0)

    expect(g.charged().size).toBe(0)
    expect(g.chargeAt(4, 7)).toBe(0)
  })

  it('counts each burning tile once however often it is set', () => {
    const g = grid()
    g.setCharge(4, 7, 1)
    g.setCharge(4, 7, 1)
    g.setCharge(9, 2, 1)

    expect(g.charged().size).toBe(2)
  })

  it('ignores charges set outside the map', () => {
    const g = grid()
    g.setCharge(-1, 5, 1)
    g.setCharge(99, 5, 1)
    expect(g.charged().size).toBe(0)
  })
})
