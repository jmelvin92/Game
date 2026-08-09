import { describe, expect, it } from 'vitest'
import { cutawayOpacity } from '@/render/renderer'

/**
 * The cutaway decides which walls fade so the character stays visible indoors.
 * Getting the direction backwards would fade the walls *behind* them and leave the
 * ones actually in the way solid — which looks like a rendering fault rather than a
 * logic one, so it is worth pinning down here.
 */
describe('wall cutaway', () => {
  const actorX = 10
  const actorY = 10

  it('leaves walls behind the actor fully opaque', () => {
    // Smaller x + y means further from the camera, so these can never be in the way.
    expect(cutawayOpacity(9, 10, actorX, actorY)).toBe(1)
    expect(cutawayOpacity(10, 9, actorX, actorY)).toBe(1)
    expect(cutawayOpacity(8, 8, actorX, actorY)).toBe(1)
  })

  it('leaves walls level with the actor opaque', () => {
    // Equal depth: alongside, not in front.
    expect(cutawayOpacity(11, 9, actorX, actorY)).toBe(1)
  })

  it('fades a near wall standing between the actor and the camera', () => {
    expect(cutawayOpacity(11, 10, actorX, actorY)).toBeLessThan(1)
    expect(cutawayOpacity(10.5, 10.5, actorX, actorY)).toBeLessThan(1)
  })

  it('leaves distant walls alone even when they are in front', () => {
    expect(cutawayOpacity(20, 20, actorX, actorY)).toBe(1)
  })

  it('never hides a wall completely, so the room stays readable', () => {
    const closest = cutawayOpacity(10.01, 10.01, actorX, actorY)

    expect(closest).toBeGreaterThan(0)
    expect(closest).toBeLessThan(0.5)
  })

  it('fades smoothly with distance rather than snapping', () => {
    const near = cutawayOpacity(11, 10.5, actorX, actorY)
    const mid = cutawayOpacity(12, 11, actorX, actorY)
    const far = cutawayOpacity(13, 12, actorX, actorY)

    expect(near).toBeLessThan(mid)
    expect(mid).toBeLessThan(far)
    expect(far).toBeLessThanOrEqual(1)
  })
})
