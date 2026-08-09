/**
 * Health slots and the gift.
 *
 * Health is five discrete slots, and the gift does not spend them — it loans
 * them. Lighting a device commits one slot for as long as the device burns;
 * switching it off hands the slot straight back. Nothing is permanent: the
 * player is a walking power grid, and the city is lit with pieces of them.
 *
 * The tension this buys: light keeps the dark at bay, but every lit lamp is a
 * slot you are not holding. The safest-looking night — everything burning — is
 * the one where the least of you is left to survive it.
 *
 * There is deliberately no second ledger of what is loaned where. A lit device
 * IS a loan, so the world's count of lit tiles (`grid.charged().size`) is the
 * count of slots out. Two records of one fact would drift; this cannot.
 *
 * Slots above the starting five come from the world — rare finds, planned as
 * exploration rewards — which is why the total is an ordinary mutable number.
 */

export interface Vitals {
  /** Total health slots owned. Starts at {@link STARTING_SLOTS}; found items raise it. */
  slots: number
  /** Counts down after channelling, so the loan can be felt rather than read. */
  strainFor: number
}

export const STARTING_SLOTS = 5

/** How long the after-effect of channelling lingers, in seconds. */
const STRAIN_DURATION = 2.4

export function createVitals(): Vitals {
  return { slots: STARTING_SLOTS, strainFor: 0 }
}

export function updateVitals(vitals: Vitals, step: number): void {
  vitals.strainFor = Math.max(0, vitals.strainFor - step)
}

/** Slots still in the body, given how many are out on loan. */
export function freeSlots(vitals: Vitals, loaned: number): number {
  return Math.max(0, vitals.slots - loaned)
}

/**
 * Whether another slot can be loaned out.
 *
 * The last slot can never be loaned: health at zero is death, and the gift
 * does not do suicide by streetlight. One bar always stays home.
 */
export function canLoan(vitals: Vitals, loaned: number): boolean {
  return freeSlots(vitals, loaned) > 1
}

/** The moment of channelling, felt in the body. */
export function strain(vitals: Vitals): void {
  vitals.strainFor = STRAIN_DURATION
}

/**
 * Grants a permanent extra slot — the rare exploration find.
 *
 * Nothing spawns one yet. It exists so the rule lives here rather than being
 * invented by whatever loot eventually calls it.
 */
export function grantSlot(vitals: Vitals): void {
  vitals.slots += 1
}
