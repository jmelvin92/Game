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

/**
 * What channelling takes out of the body, per unit of power spent.
 *
 * Proportional to the power spent rather than flat, now that devices cost
 * different amounts: waking a vehicle should cost more of you than waking a lamp.
 * It is not proportional to what is *left*, though — running low must never become
 * a reason to use the gift more freely.
 */
export const HEALTH_PER_POWER = 0.28

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

/** True if there is enough of both to energise something costing `cost`. */
export function canChannel(vitals: Vitals, cost: number): boolean {
  return vitals.power >= cost && vitals.health > cost * HEALTH_PER_POWER
}

export function channel(vitals: Vitals, cost: number): void {
  vitals.power = Math.max(0, vitals.power - cost)
  vitals.health = Math.max(0, vitals.health - cost * HEALTH_PER_POWER)
  // Bigger draws leave you reeling for longer.
  vitals.strainFor = STRAIN_DURATION * Math.min(2, 0.6 + cost * 2.5)
}
