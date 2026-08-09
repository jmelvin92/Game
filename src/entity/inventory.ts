/**
 * The backpack: what the player is carrying.
 *
 * Pure simulation — the panel that shows it lives in `render/`, and whether it is
 * on screen is UI state that lives with the input wiring, not here. This module
 * only answers what is carried and how it packs.
 *
 * Items are plain numeric ids. Nothing defines any actual item yet — loot comes
 * later — but the model is built for them: slots hold stacks, stacks have a
 * limit, and adding past capacity reports the overflow instead of losing it,
 * because "my bag is full" is a survival decision and not an error.
 */

/** How many slots the backpack holds. */
export const BACKPACK_SLOTS = 12

/**
 * How many of one item share a slot.
 *
 * One limit for everything until items exist to differ — a per-item limit is a
 * def-table entry waiting for a def table.
 */
export const STACK_LIMIT = 5

export interface Stack {
  readonly item: number
  count: number
}

export interface Inventory {
  /** Fixed length {@link BACKPACK_SLOTS}; empty slots are null. */
  readonly slots: (Stack | null)[]
}

export function createInventory(): Inventory {
  return { slots: Array.from({ length: BACKPACK_SLOTS }, () => null) }
}

/**
 * Adds items, filling existing stacks before opening new slots.
 *
 * @returns how many did not fit; 0 means everything was taken
 */
export function addItem(inventory: Inventory, item: number, count = 1): number {
  let remaining = count

  // Top up existing stacks first, so partial stacks never accumulate.
  for (const slot of inventory.slots) {
    if (remaining === 0) break
    if (slot?.item !== item || slot.count >= STACK_LIMIT) continue

    const take = Math.min(remaining, STACK_LIMIT - slot.count)
    slot.count += take
    remaining -= take
  }

  // Then open fresh slots.
  for (let i = 0; i < inventory.slots.length && remaining > 0; i++) {
    if (inventory.slots[i] !== null) continue

    const take = Math.min(remaining, STACK_LIMIT)
    inventory.slots[i] = { item, count: take }
    remaining -= take
  }

  return remaining
}

/**
 * Removes items, draining later stacks first so the bag empties from the back.
 *
 * @returns how many were actually removed, which is less than asked when the
 *   bag runs out
 */
export function removeItem(inventory: Inventory, item: number, count = 1): number {
  let remaining = count

  for (let i = inventory.slots.length - 1; i >= 0 && remaining > 0; i--) {
    const slot = inventory.slots[i]
    if (slot?.item !== item) continue

    const take = Math.min(remaining, slot.count)
    slot.count -= take
    remaining -= take

    if (slot.count === 0) inventory.slots[i] = null
  }

  return count - remaining
}

/** Total carried of one item, across every stack. */
export function countOf(inventory: Inventory, item: number): number {
  let total = 0
  for (const slot of inventory.slots) {
    if (slot !== null && slot.item === item) total += slot.count
  }
  return total
}

export function isEmpty(inventory: Inventory): boolean {
  return inventory.slots.every((slot) => slot === null)
}
