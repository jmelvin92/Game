import { describe, expect, it } from 'vitest'

import { createClock, sunAltitude } from '@/core/time'
import { sunAt } from '@/render/daylight'
import { darknessAt } from '@/render/lighting'

/**
 * The day/night cycle was reported as "not working" when it was in fact running
 * perfectly and simply had the wrong shape: hour thresholds with two-hour linear
 * ramps left six real minutes of unchanging black, then delivered an entire sunrise
 * in ninety seconds. Nothing was broken in a way any test could see, because every
 * individual value was correct — it was the *shape over time* that was wrong.
 *
 * So these test the shape. They are the only kind of test that would have caught it.
 */

/**
 * Samples the cycle at a fixed real-time interval.
 *
 * Two days rather than one, and it matters: night straddles midnight, so a single
 * day starting there cuts the longest unchanging stretch in half and hides exactly
 * the thing these tests exist to measure. It let the original defect pass.
 *
 * @param days how many whole cycles to walk
 */
function sample(
  intervalSeconds: number,
  days = 2,
): { hour: number; darkness: number; sun: number }[] {
  const clock = createClock(0)
  const steps = Math.round((clock.dayLength() * days) / intervalSeconds)
  const out = []

  for (let i = 0; i < steps; i++) {
    out.push({
      hour: clock.hour(),
      darkness: darknessAt(clock.fraction),
      sun: sunAt(clock.fraction).elevation,
    })
    clock.advance(intervalSeconds)
  }

  return out
}

/**
 * Real seconds taken to cross between two light levels — how long a sunrise or a
 * sunset actually lasts, which is the thing that was wrong.
 */
function crossing(from: number, to: number): number {
  const interval = 1
  const samples = sample(interval)
  let best = Infinity
  let started = -1

  const rising = to > from
  for (const [i, s] of samples.entries()) {
    const past = rising ? s.darkness >= to : s.darkness <= to
    const before = rising ? s.darkness <= from : s.darkness >= from

    if (before) started = i
    else if (past && started >= 0) {
      best = Math.min(best, (i - started) * interval)
      started = -1
    }
  }

  return best
}

describe('the sun', () => {
  it('is overhead at noon and beneath us at midnight', () => {
    expect(sunAltitude(0.5)).toBeCloseTo(1)
    expect(sunAltitude(0)).toBeCloseTo(-1)
  })

  it('crosses the horizon at six', () => {
    expect(sunAltitude(6 / 24)).toBeCloseTo(0)
    expect(sunAltitude(18 / 24)).toBeCloseTo(0)
  })

  it('agrees with the light level about when it has set', () => {
    // The defect this prevents is subtler than a wrong number: two functions each
    // working out the sun's position from the hour, drifting apart, and no test
    // able to say which was wrong. Whenever the sun is meaningfully up it must not
    // also be fully dark.
    for (const { sun, darkness, hour } of sample(5)) {
      if (sun > 0.1) {
        expect(
          darkness,
          `dark=${darkness.toFixed(2)} with the sun up at hour ${hour.toFixed(1)}`,
        ).toBeLessThan(1)
      }
    }
  })
})

describe('the cycle', () => {
  it('is fully light at midday and fully dark at midnight', () => {
    expect(darknessAt(0.5)).toBe(0)
    expect(darknessAt(0)).toBe(1)
  })

  it('never jumps', () => {
    // A tenth of a second of real time must never move the light level far. This is
    // what makes dusk a sunset rather than a cut.
    let worst = 0
    let previous: number | undefined
    for (const { darkness } of sample(0.1)) {
      if (previous !== undefined) worst = Math.max(worst, Math.abs(darkness - previous))
      previous = darkness
    }
    expect(worst).toBeLessThan(0.01)
  })

  it('is never visually static for long', () => {
    // The actual bug, stated as a property. "Static" means neither the light level
    // nor the sun's height is moving — during the day darkness sits at zero for
    // several minutes, but the sun is still swinging the shadows around, so the
    // picture is not standing still.
    const interval = 5

    let longest = 0
    let run = 0
    let previous: { darkness: number; sun: number } | undefined

    for (const now of sample(interval)) {
      if (previous !== undefined) {
        const moved =
          Math.abs(now.darkness - previous.darkness) > 0.002 ||
          Math.abs(now.sun - previous.sun) > 0.002
        run = moved ? 0 : run + interval
        longest = Math.max(longest, run)
      }
      previous = now
    }

    // Four real minutes. Deep night is genuinely meant to sit at full dark for a
    // while — that is the game — but a third of the cycle was too much and read as
    // a frozen clock.
    expect(longest / 60).toBeLessThan(4)
  })

  it('takes its time over sunrise and sunset', () => {
    // The complaint, stated as a number. Dawn used to arrive in about eighty
    // seconds of real time, which is not a sunrise — it is a cut between two
    // shots. Both directions must take minutes.
    expect(crossing(0.9, 0.1) / 60).toBeGreaterThan(2.5)
    expect(crossing(0.1, 0.9) / 60).toBeGreaterThan(2.5)
  })

  it('spends most of its length in twilight rather than at the extremes', () => {
    // Dawn and dusk are the best the game looks and the only part where the light
    // is visibly moving, so they should not be a rounding error on the cycle.
    const samples = sample(5)
    const moving = samples.filter((s) => s.darkness > 0.02 && s.darkness < 0.98).length
    expect(moving / samples.length).toBeGreaterThan(0.3)
  })
})
