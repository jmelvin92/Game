/**
 * Keyboard input, reported as a direction in world tiles.
 *
 * The mapping is what makes isometric movement feel right: W moves the character up
 * the screen, not along a world axis. Screen-up is world (-1,-1), because that leaves
 * `wx - wy` unchanged (no horizontal shift) while reducing `wx + wy` (upward). The
 * other three keys follow the same reasoning, and pressing two together produces the
 * diagonals, giving eight directions from four keys.
 */

export interface Direction {
  readonly x: number
  readonly y: number
}

const KEY_DIRECTIONS: ReadonlyMap<string, Direction> = new Map([
  ['KeyW', { x: -1, y: -1 }],
  ['ArrowUp', { x: -1, y: -1 }],
  ['KeyS', { x: 1, y: 1 }],
  ['ArrowDown', { x: 1, y: 1 }],
  ['KeyA', { x: -1, y: 1 }],
  ['ArrowLeft', { x: -1, y: 1 }],
  ['KeyD', { x: 1, y: -1 }],
  ['ArrowRight', { x: 1, y: -1 }],
])

export interface Input {
  /** Current movement direction, normalised. Both components are zero when idle. */
  direction(): Direction
  dispose(): void
}

export function createInput(target: EventTarget = window): Input {
  const pressed = new Set<string>()

  const onKeyDown = (event: Event): void => {
    const { code } = event as KeyboardEvent
    if (!KEY_DIRECTIONS.has(code)) return

    pressed.add(code)
    // Otherwise the arrow keys scroll the page out from under the game.
    event.preventDefault()
  }

  const onKeyUp = (event: Event): void => {
    pressed.delete((event as KeyboardEvent).code)
  }

  // Keys held while the window loses focus would otherwise stay stuck down.
  const onBlur = (): void => {
    pressed.clear()
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)

  return {
    direction(): Direction {
      let x = 0
      let y = 0

      for (const code of pressed) {
        const direction = KEY_DIRECTIONS.get(code)
        if (direction === undefined) continue
        x += direction.x
        y += direction.y
      }

      // Without normalising, holding two keys would move the character faster
      // diagonally than in a straight line.
      const length = Math.hypot(x, y)
      if (length === 0) return { x: 0, y: 0 }

      return { x: x / length, y: y / length }
    },

    dispose(): void {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
      pressed.clear()
    },
  }
}
