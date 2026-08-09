import { describe, expect, it } from 'vitest'
import { createClock } from '@/core/time'

describe('the clock', () => {
  it('runs a full day in the length it is given', () => {
    const clock = createClock(0, 100)
    clock.advance(50)

    expect(clock.hour()).toBeCloseTo(12, 5)
  })

  it('wraps past midnight rather than running off the end', () => {
    const clock = createClock(23, 100)
    clock.advance(10)

    expect(clock.hour()).toBeLessThan(3)
  })

  it('refuses a day length short enough to break the maths', () => {
    const clock = createClock(6, 100)
    clock.setDayLength(0)
    clock.advance(1)

    // A zero length would divide by nothing and put the clock at NaN, which shows
    // up as the world losing its lighting entirely — a thoroughly confusing way to
    // discover a typo in a console command.
    expect(Number.isFinite(clock.hour())).toBe(true)
  })

  it('stops entirely when paused', () => {
    const clock = createClock(6, 100)
    clock.setPaused(true)
    clock.advance(50)

    expect(clock.hour()).toBeCloseTo(6, 5)

    clock.setPaused(false)
    clock.advance(25)
    expect(clock.hour()).toBeCloseTo(12, 5)
  })
})
