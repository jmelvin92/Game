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
  /** 0 to 1. Nothing restores this yet, by design — decline is the direction. */
  health: number
  /** 0 to 1. Restored by daylight, spent on the gift. */
  power: number
  /** Counts down after channelling, so the drain can be felt rather than read. */
  strainFor: number
}

/** Power restored per second in full daylight. A day fills roughly two thirds. */
const RECHARGE_RATE = 1 / 900

/** Cost of waking one lamp. */
export const CHANNEL_POWER_COST = 0.16

/**
 * What waking a lamp takes out of the body.
 *
 * Deliberately not proportional to how much power is left: the gift costs the same
 * whether you are fresh or nearly empty, so running low never becomes a reason to
 * use it more freely.
 */
export const CHANNEL_HEALTH_COST = 0.045

/** How long the after-effect of channelling lingers, in seconds. */
const STRAIN_DURATION = 2.4

export function createVitals(): Vitals {
  return { health: 1, power: 1, strainFor: 0 }
}

/**
 * @param daylight 0 in full dark through to 1 at midday
 */
export function updateVitals(vitals: Vitals, step: number, daylight: number): void {
  vitals.power = Math.min(1, vitals.power + RECHARGE_RATE * daylight * step)
  vitals.strainFor = Math.max(0, vitals.strainFor - step)
}

/** True if there is enough left to wake a lamp. */
export function canChannel(vitals: Vitals): boolean {
  return vitals.power >= CHANNEL_POWER_COST && vitals.health > CHANNEL_HEALTH_COST
}

export function channel(vitals: Vitals): void {
  vitals.power = Math.max(0, vitals.power - CHANNEL_POWER_COST)
  vitals.health = Math.max(0, vitals.health - CHANNEL_HEALTH_COST)
  vitals.strainFor = STRAIN_DURATION
}
