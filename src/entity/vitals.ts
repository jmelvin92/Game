/**
 * Health and the gift.
 *
 * Two resources that pull against each other. Channelling power into a dead lamp
 * keeps the dark at bay, but every use takes something out of the body that
 * daylight does not put back — so the safest night is also the one that costs the
 * most to have survived.
 *
 * Nothing here knows how any of it is shown. Both values are read by the renderer
 * to decide how the world looks, rather than being drawn as bars.
 */

export interface Vitals {
  /** 0 to {@link Vitals.ceiling}. */
  health: number
  /**
   * The most health that can currently be held.
   *
   * Channelling takes a permanent sliver of this as well as spending health, so
   * the gift is a bargain rather than a resource: every device you wake costs you
   * a little of your life, and rest can only ever bring you back to the ceiling.
   *
   * Deliberately a plain value that moves in both directions rather than a
   * one-way decrement, because there is meant to be a way to win some of it back
   * later. Writing it as monotonic would be painful to reverse.
   */
  ceiling: number
  /** 0 to 1. Restored by daylight, spent on the gift. */
  power: number
  /** Counts down after channelling, so the drain can be felt rather than read. */
  strainFor: number
}

/** Power restored per second in full daylight. A day fills roughly two thirds. */
const RECHARGE_RATE = 1 / 900

/**
 * What channelling takes out of the body, per unit of power spent.
 *
 * Proportional to the power spent rather than flat, now that devices cost
 * different amounts: waking a vehicle should cost more of you than waking a lamp.
 * It is not proportional to what is *left*, though — running low must never become
 * a reason to use the gift more freely.
 */
export const HEALTH_PER_POWER = 0.28

/**
 * Permanent ceiling lost per unit of power channelled.
 *
 * A sliver — waking one lamp costs about half a percent, so it takes something
 * like a hundred devices to halve you. The intent is that a single night is barely
 * felt and a fortnight of them is unmistakable, which is the arc rather than a
 * difficulty setting.
 *
 * This is the number that sets how long a run lasts. Nothing else in the design
 * pins that down yet, so treat it as provisional and expect to retune it once
 * there is a reason to survive a specific length of time.
 */
export const CEILING_LOSS_PER_POWER = 0.03

/** The ceiling never falls below this, or a run would end without the player acting. */
const MINIMUM_CEILING = 0.15

/** How long the after-effect of channelling lingers, in seconds. */
const STRAIN_DURATION = 2.4

export function createVitals(): Vitals {
  return { health: 1, ceiling: 1, power: 1, strainFor: 0 }
}

/**
 * @param daylight 0 in full dark through to 1 at midday
 */
export function updateVitals(vitals: Vitals, step: number, daylight: number): void {
  vitals.power = Math.min(1, vitals.power + RECHARGE_RATE * daylight * step)
  vitals.strainFor = Math.max(0, vitals.strainFor - step)
}

/** True if there is enough of both to energise something costing `cost`. */
export function canChannel(vitals: Vitals, cost: number): boolean {
  return vitals.power >= cost && vitals.health > cost * HEALTH_PER_POWER
}

export function channel(vitals: Vitals, cost: number): void {
  vitals.power = Math.max(0, vitals.power - cost)
  vitals.ceiling = Math.max(MINIMUM_CEILING, vitals.ceiling - cost * CEILING_LOSS_PER_POWER)

  // Health is spent and then clamped, so a fallen ceiling takes effect at once
  // rather than waiting for the next time something happens to check.
  vitals.health = Math.min(vitals.ceiling, Math.max(0, vitals.health - cost * HEALTH_PER_POWER))

  // Bigger draws leave you reeling for longer.
  vitals.strainFor = STRAIN_DURATION * Math.min(2, 0.6 + cost * 2.5)
}

/**
 * Restores health, never past the ceiling.
 *
 * Nothing calls this yet — rest and medicine are not built. It exists so that the
 * rule about the ceiling lives in one place rather than being re-derived by
 * whatever eventually heals.
 */
export function heal(vitals: Vitals, amount: number): void {
  vitals.health = Math.min(vitals.ceiling, vitals.health + amount)
}

/**
 * Wins back some of the ceiling.
 *
 * Also unused, and also here on purpose: Joshua wants a late-game way to recover
 * what the gift has taken, and the only thing that makes that cheap to add later
 * is the ceiling being an ordinary value now rather than a one-way count.
 */
export function restoreCeiling(vitals: Vitals, amount: number): void {
  vitals.ceiling = Math.min(1, vitals.ceiling + amount)
}
