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
}

/** How many real seconds one in-game day lasts. */
const DEFAULT_DAY_LENGTH = 20 * 60

export function createClock(startHour = 0, dayLengthSeconds = DEFAULT_DAY_LENGTH): Clock {
  let fraction = (startHour / 24) % 1

  return {
    get fraction() {
      return fraction
    },

    advance(seconds: number): void {
      fraction = (fraction + seconds / dayLengthSeconds) % 1
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
