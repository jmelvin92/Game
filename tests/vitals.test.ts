import { describe, expect, it } from 'vitest'

import {
  canLoan,
  createVitals,
  freeSlots,
  grantSlot,
  STARTING_SLOTS,
  strain,
  updateVitals,
} from '@/entity/vitals'

describe('health slots', () => {
  it('start at five, all free', () => {
    const vitals = createVitals()
    expect(vitals.slots).toBe(STARTING_SLOTS)
    expect(freeSlots(vitals, 0)).toBe(STARTING_SLOTS)
  })

  it('are loaned out one per burning device', () => {
    const vitals = createVitals()
    expect(freeSlots(vitals, 3)).toBe(STARTING_SLOTS - 3)
  })

  it('never loan the last one', () => {
    const vitals = createVitals()

    // Four of five can go out; the fifth stays home.
    expect(canLoan(vitals, 0)).toBe(true)
    expect(canLoan(vitals, STARTING_SLOTS - 2)).toBe(true)
    expect(canLoan(vitals, STARTING_SLOTS - 1)).toBe(false)
    expect(canLoan(vitals, STARTING_SLOTS)).toBe(false)
  })

  it('come back the moment the loan ends', () => {
    // The loan count is derived from the world, so "the moment" is literal:
    // there is no ledger to reconcile, only a smaller count to pass in.
    const vitals = createVitals()
    expect(freeSlots(vitals, 4)).toBe(1)
    expect(freeSlots(vitals, 3)).toBe(2)
  })

  it('grow when a rare find grants one', () => {
    const vitals = createVitals()
    grantSlot(vitals)

    expect(vitals.slots).toBe(STARTING_SLOTS + 1)
    // The new slot extends what can be loaned, not just what can be held.
    expect(canLoan(vitals, STARTING_SLOTS - 1)).toBe(true)
  })

  it('never report negative free slots', () => {
    // More loans than slots cannot happen through canLoan, but a stale save or
    // a bug should degrade to zero rather than to nonsense.
    const vitals = createVitals()
    expect(freeSlots(vitals, 99)).toBe(0)
  })

  it('feel the strain of channelling, then recover', () => {
    const vitals = createVitals()
    strain(vitals)
    expect(vitals.strainFor).toBeGreaterThan(0)

    updateVitals(vitals, 10)
    expect(vitals.strainFor).toBe(0)
  })
})
