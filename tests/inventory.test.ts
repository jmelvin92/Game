import { describe, expect, it } from 'vitest'

import {
  addItem,
  BACKPACK_SLOTS,
  countOf,
  createInventory,
  isEmpty,
  removeItem,
  STACK_LIMIT,
} from '@/entity/inventory'

describe('the backpack', () => {
  it('starts empty', () => {
    const bag = createInventory()
    expect(bag.slots).toHaveLength(BACKPACK_SLOTS)
    expect(isEmpty(bag)).toBe(true)
  })

  it('stacks the same item rather than spreading it', () => {
    const bag = createInventory()
    addItem(bag, 1)
    addItem(bag, 1)
    addItem(bag, 1)

    expect(countOf(bag, 1)).toBe(3)
    expect(bag.slots.filter((s) => s !== null)).toHaveLength(1)
  })

  it('opens a new slot when a stack is full', () => {
    const bag = createInventory()
    addItem(bag, 1, STACK_LIMIT + 2)

    expect(countOf(bag, 1)).toBe(STACK_LIMIT + 2)
    expect(bag.slots.filter((s) => s !== null)).toHaveLength(2)
  })

  it('tops up part-filled stacks before opening slots', () => {
    const bag = createInventory()
    addItem(bag, 1, STACK_LIMIT - 1)
    addItem(bag, 2, 1)
    addItem(bag, 1, 2)

    // The two extra of item 1 should finish its stack and open one more slot,
    // not open two.
    expect(bag.slots.filter((s) => s?.item === 1)).toHaveLength(2)
  })

  it('reports overflow instead of losing it', () => {
    const bag = createInventory()
    const capacity = BACKPACK_SLOTS * STACK_LIMIT

    expect(addItem(bag, 1, capacity)).toBe(0)
    expect(addItem(bag, 1, 3)).toBe(3)
    expect(countOf(bag, 1)).toBe(capacity)
  })

  it('keeps different items apart', () => {
    const bag = createInventory()
    addItem(bag, 1, 2)
    addItem(bag, 2, 2)

    expect(countOf(bag, 1)).toBe(2)
    expect(countOf(bag, 2)).toBe(2)
    expect(bag.slots.filter((s) => s !== null)).toHaveLength(2)
  })

  it('removes across stacks and frees emptied slots', () => {
    const bag = createInventory()
    addItem(bag, 1, STACK_LIMIT + 3)

    expect(removeItem(bag, 1, STACK_LIMIT + 1)).toBe(STACK_LIMIT + 1)
    expect(countOf(bag, 1)).toBe(2)
    expect(bag.slots.filter((s) => s !== null)).toHaveLength(1)
  })

  it('removes only what is there', () => {
    const bag = createInventory()
    addItem(bag, 1, 2)

    expect(removeItem(bag, 1, 10)).toBe(2)
    expect(isEmpty(bag)).toBe(true)
  })
})
