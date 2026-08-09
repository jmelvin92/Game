/**
 * Fixed-timestep game loop.
 *
 * Simulation advances in constant slices regardless of frame rate, so movement and
 * collision behave identically on a 60Hz and a 144Hz display. Rendering happens once
 * per animation frame, whatever the simulation did.
 */

/** Simulation runs at a steady 60 steps per second. */
const STEP_MS = 1000 / 60

/**
 * Longest frame the accumulator will honour. A backgrounded tab can resume with a
 * gap of many seconds; without this clamp the loop would try to catch up in one go,
 * freeze, and fall further behind. Dropped time is preferable to a spiral.
 */
const MAX_FRAME_MS = 250

export interface Loop {
  stop(): void
}

/**
 * @param update advances the simulation by `step` seconds
 * @param render draws the current state
 */
export function startLoop(update: (step: number) => void, render: () => void): Loop {
  const stepSeconds = STEP_MS / 1000

  let previous = performance.now()
  let accumulator = 0
  let handle = 0
  let running = true

  const tick = (now: number): void => {
    if (!running) return

    accumulator += Math.min(now - previous, MAX_FRAME_MS)
    previous = now

    while (accumulator >= STEP_MS) {
      update(stepSeconds)
      accumulator -= STEP_MS
    }

    render()
    handle = requestAnimationFrame(tick)
  }

  handle = requestAnimationFrame(tick)

  return {
    stop(): void {
      running = false
      cancelAnimationFrame(handle)
    },
  }
}
