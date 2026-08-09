import { describe, expect, it } from 'vitest'
import {
  canChannel,
  channel,
  createVitals,
  heal,
  restoreCeiling,
  updateVitals,
} from '@/entity/vitals'

/**
 * The ceiling is the whole shape of a run — it is what makes the gift a bargain
 * rather than a resource. These pin the rules that make that true, because each one
 * would be easy to break by accident and none of them are visible from a screenshot.
 */
describe('the ceiling', () => {
  it('falls a little every time the gift is used', () => {
    const vitals = createVitals()
    const before = vitals.ceiling

    channel(vitals, 0.16)

    expect(vitals.ceiling).toBeLessThan(before)
    // A sliver, not a chunk: one lamp should be barely felt.
    expect(before - vitals.ceiling).toBeLessThan(0.01)
  })

  it('takes many uses to halve, so a single night is survivable', () => {
    const vitals = createVitals()
    for (let i = 0; i < 40; i++) {
      vitals.power = 1
      channel(vitals, 0.16)
    }

    expect(vitals.ceiling).toBeGreaterThan(0.7)
  })

  it('caps health, so rest can never undo what the gift took', () => {
    const vitals = createVitals()
    for (let i = 0; i < 10; i++) {
      vitals.power = 1
      channel(vitals, 0.16)
    }

    heal(vitals, 1)

    expect(vitals.health).toBe(vitals.ceiling)
    expect(vitals.health).toBeLessThan(1)
  })

  it('can be won back, which is what the late game is meant to allow', () => {
    const vitals = createVitals()
    for (let i = 0; i < 20; i++) {
      vitals.power = 1
      channel(vitals, 0.16)
    }
    const worn = vitals.ceiling

    restoreCeiling(vitals, 0.1)

    expect(vitals.ceiling).toBeGreaterThan(worn)
    expect(vitals.ceiling).toBeLessThanOrEqual(1)
  })

  it('never falls far enough to end a run on its own', () => {
    const vitals = createVitals()
    for (let i = 0; i < 2000; i++) {
      vitals.power = 1
      vitals.health = vitals.ceiling
      channel(vitals, 0.16)
    }

    expect(vitals.ceiling).toBeGreaterThan(0.1)
  })
})

describe('the gift', () => {
  it('refuses when there is not enough power', () => {
    const vitals = createVitals()
    vitals.power = 0.05

    expect(canChannel(vitals, 0.16)).toBe(false)
  })

  it('costs more of the body for a bigger draw', () => {
    const lamp = createVitals()
    const vehicle = createVitals()

    channel(lamp, 0.16)
    channel(vehicle, 0.5)

    expect(1 - vehicle.health).toBeGreaterThan(1 - lamp.health)
    expect(vehicle.ceiling).toBeLessThan(lamp.ceiling)
  })

  it('is restored by daylight and not by darkness', () => {
    const day = createVitals()
    const night = createVitals()
    day.power = 0.2
    night.power = 0.2

    updateVitals(day, 120, 1)
    updateVitals(night, 120, 0)

    expect(day.power).toBeGreaterThan(0.2)
    expect(night.power).toBe(0.2)
  })
})
