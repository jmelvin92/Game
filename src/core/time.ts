/**
 * Time of day.
 *
 * Kept as a fraction of a day rather than hours and minutes, because everything
 * that reads it — light levels, and later whatever behaves differently at night —
 * wants a smooth value to interpolate against, not a clock face. Hours exist only
 * for showing the player.
 */

export interface Clock {
  /** Fraction of the day elapsed, 0 at midnight through to 1 at the next midnight. */
  readonly fraction: number
  advance(seconds: number): void
  /** Jump straight to an hour, for testing and for starting the game at night. */
  setHour(hour: number): void
  hour(): number
  label(): string

  /**
   * How many real seconds a whole day takes.
   *
   * Adjustable at runtime because anything to do with light is judged by watching
   * it change, and waiting twenty minutes to see dusk arrive is not a workable way
   * to tune dusk.
   */
  dayLength(): number
  setDayLength(seconds: number): void
  /** Frozen clocks are for looking at one moment properly. */
  paused(): boolean
  setPaused(paused: boolean): void
}

/**
 * How high the sun is: +1 at noon, 0 at the horizon, -1 at midnight.
 *
 * The one place the sun's position is decided. Darkness, shadow length, sky colour
 * and the recharge rate all derive from this rather than each working it out from
 * the hour, because two functions independently modelling the same sun is precisely
 * the kind of thing that drifts apart without anyone noticing — as it had. Sunset
 * according to the light level was 21:00 while sunset according to the shadows was
 * 20:00, and nothing pointed at which was wrong.
 *
 * A cosine rather than anything astronomical. It is continuous everywhere, which is
 * the property that actually matters: a cycle assembled from hour thresholds sits
 * still for minutes and then jumps, and reads as broken rather than as slow.
 */
export function sunAltitude(fraction: number): number {
  return Math.cos(2 * Math.PI * (fraction - 0.5))
}

/** How many real seconds one in-game day lasts. */
const DEFAULT_DAY_LENGTH = 20 * 60

export function createClock(startHour = 0, dayLengthSeconds = DEFAULT_DAY_LENGTH): Clock {
  let fraction = (startHour / 24) % 1
  let length = dayLengthSeconds
  let frozen = false

  return {
    get fraction() {
      return fraction
    },

    advance(seconds: number): void {
      if (frozen) return
      fraction = (fraction + seconds / length) % 1
    },

    dayLength(): number {
      return length
    },

    setDayLength(seconds: number): void {
      // A floor, or a stray zero divides by nothing and the clock goes to NaN —
      // which shows up as the world losing its lighting entirely and is a
      // thoroughly confusing way to find a typo.
      length = Math.max(4, seconds)
    },

    paused(): boolean {
      return frozen
    },

    setPaused(paused: boolean): void {
      frozen = paused
    },

    setHour(hour: number): void {
      fraction = (((hour / 24) % 1) + 1) % 1
    },

    hour(): number {
      return fraction * 24
    },

    label(): string {
      const total = fraction * 24 * 60
      const hours = Math.floor(total / 60)
      const minutes = Math.floor(total % 60)
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    },
  }
}
