import { worldToScreen } from '@/render/iso'

/**
 * A camera centred on a world position.
 */

export interface Camera {
  /** World position held at the centre of the viewport. */
  x: number
  y: number
}

export function createCamera(x: number, y: number): Camera {
  return { x, y }
}

/**
 * Ease the camera toward a target.
 *
 * Framerate-independent exponential smoothing: the fraction of remaining distance
 * covered per second is constant, so the motion is identical at 60Hz and 144Hz. A
 * plain `lerp(current, target, 0.1)` per frame would drift faster on faster
 * displays, which is a bug that hides on the machine it was written on.
 */
export function followCamera(camera: Camera, targetX: number, targetY: number, step: number): void {
  const smoothing = 1 - Math.exp(-10 * step)

  camera.x += (targetX - camera.x) * smoothing
  camera.y += (targetY - camera.y) * smoothing
}

/** Pixels to add to a projected point to place it correctly in the viewport. */
export function cameraOffset(
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number,
): ScreenOffset {
  const centre = worldToScreen(camera.x, camera.y)

  return {
    ox: viewportWidth / 2 - centre.sx,
    oy: viewportHeight / 2 - centre.sy,
  }
}

export interface ScreenOffset {
  readonly ox: number
  readonly oy: number
}
