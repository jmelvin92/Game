import type { Actor } from '@/entity/actor'

/**
 * Deciding when a footstep happens.
 *
 * Driven by distance covered rather than by the animation frame. Two reasons: the
 * feet then land at the same points on the ground however fast the character is
 * moving, so running produces more steps rather than the same steps played faster;
 * and it stays correct if the animation is ever replaced with one of a different
 * length.
 *
 * This lives in `entity/` rather than beside the audio because a footstep is an
 * event in the world, not a sound. Whatever eventually hears them — something
 * hunting by noise, say — needs the event, and a sound is only one thing to do
 * with it.
 */

/** Tiles covered per pace. About right for an adult stride at this tile scale. */
const STRIDE = 0.82

/** Running lengthens the stride as well as quickening it. */
const RUN_STRIDE_SCALE = 1.35

export interface Footsteps {
  /**
   * Advances by however far the actor moved, and reports whether a foot landed.
   *
   * @returns true on the frame a step occurs
   */
  update(actor: Actor, previousX: number, previousY: number): boolean
}

export function createFootsteps(): Footsteps {
  // Start part-way through, so the first step lands shortly after setting off
  // rather than on the very first frame of movement.
  let travelled = STRIDE * 0.55

  return {
    update(actor: Actor, previousX: number, previousY: number): boolean {
      if (!actor.moving) {
        // Reset on stopping, so standing still and setting off again always begins
        // a stride rather than resuming a half-finished one.
        travelled = STRIDE * 0.55
        return false
      }

      travelled += Math.hypot(actor.x - previousX, actor.y - previousY)

      const stride = actor.running ? STRIDE * RUN_STRIDE_SCALE : STRIDE
      if (travelled < stride) return false

      travelled -= stride
      return true
    },
  }
}
