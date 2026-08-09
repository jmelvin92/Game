import type { Rng } from '@/core/rng'
import type { Actor } from '@/entity/actor'
import { blocked } from '@/entity/movement'
import type { Grid } from '@/world/grid'
import { isLit } from '@/world/illumination'
import { hasLineOfSight } from '@/world/vision'

/**
 * The White Eyes.
 *
 * They cannot hold together in light. That single rule is why the gift is worth
 * what it costs, why a lit lamp is worth walking to, and why the dark between them
 * is worth being afraid of.
 *
 * They do not know where you are. That is the other half, and it is what makes this
 * a game about not being found rather than a game about running: they see, they
 * hear, and when they lose you they go to where you *were* and search. Everything
 * below exists to make that true.
 */

export const HunterState = {
  /** Drifting, aware of nothing. */
  Wandering: 0,
  /** Heard something. Moving to look, not yet certain. */
  Suspicious: 1,
  /** Has you. */
  Hunting: 2,
  /** Lost you. Checking where you were before giving up. */
  Searching: 3,
} as const

export type HunterStateId = (typeof HunterState)[keyof typeof HunterState]

export interface Hunter {
  x: number
  y: number
  facingX: number
  facingY: number
  state: HunterStateId
  /** Where it believes you are. Not where you are. */
  targetX: number
  targetY: number
  /** Seconds left before it gives up on a search. */
  patience: number
  /** Seconds it has spent standing in light. Enough of it and it comes apart. */
  exposure: number
  moving: boolean
}

/**
 * How far they see in the dark.
 *
 * Short. They are not sentries — they find you by noise far more often than by
 * sight, and a long sight range would make cover pointless.
 */
const SIGHT_RANGE = 8.5

/** How far a lit torch can be seen from. You are a beacon and it costs you. */
const TORCH_SIGHT_RANGE = 20

/** How far the sound of moving carries. */
const NOISE_WALKING = 5.5
const NOISE_RUNNING = 12

/** Speeds. Searching is slower than hunting, which is what lets you break away. */
const SPEED_HUNTING = 4.6
const SPEED_SEARCHING = 2.6
const SPEED_WANDERING = 1.4

/** How close before it has you. */
const CATCH_RANGE = 0.55

/** Seconds in light before one comes apart. */
const EXPOSURE_LIMIT = 1.2

/** Seconds it will keep looking after losing you. */
const SEARCH_PATIENCE = 11

/** How near a target counts as reached. */
const ARRIVED = 0.9

/** Fewer than before, and they last: one stalking you beats six converging. */
const MAX_HUNTERS = 3

const SPAWN_MIN = 26
const SPAWN_MAX = 42
const DESPAWN_RANGE = 80

/** Seconds between attempts to add another, at full darkness. */
const SPAWN_INTERVAL = 26

export interface HunterPack {
  readonly hunters: readonly Hunter[]
  /** Seconds left on the cue that fires when one first notices you. */
  readonly noticedFor: number
  update(
    grid: Grid,
    actor: Actor,
    torchOn: boolean,
    step: number,
    darkness: number,
    rng: Rng,
  ): boolean
  clear(): void
}

/** How far the noise of the player's movement carries right now. */
function noiseRadius(actor: Actor): number {
  if (!actor.moving) return 0
  return actor.running ? NOISE_RUNNING : NOISE_WALKING
}

export function createHunterPack(): HunterPack {
  const hunters: Hunter[] = []
  let untilSpawn = 8
  let noticedFor = 0

  const spawn = (grid: Grid, actor: Actor, rng: Rng): void => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = rng.next() * Math.PI * 2
      const distance = SPAWN_MIN + rng.next() * (SPAWN_MAX - SPAWN_MIN)
      const x = actor.x + Math.cos(angle) * distance
      const y = actor.y + Math.sin(angle) * distance

      if (x < 2 || y < 2 || x > grid.width - 2 || y > grid.height - 2) continue
      if (blocked(grid, x, y, 0.3)) continue
      if (isLit(grid, x, y)) continue

      hunters.push({
        x,
        y,
        facingX: 1,
        facingY: 1,
        state: HunterState.Wandering,
        targetX: x,
        targetY: y,
        patience: 0,
        exposure: 0,
        moving: false,
      })
      return
    }
  }

  /** Moves toward a point, sliding along whatever it catches on. */
  const advance = (grid: Grid, hunter: Hunter, speed: number, step: number): void => {
    const dx = hunter.targetX - hunter.x
    const dy = hunter.targetY - hunter.y
    const distance = Math.hypot(dx, dy)

    if (distance < 0.05) {
      hunter.moving = false
      return
    }

    const dirX = dx / distance
    const dirY = dy / distance
    hunter.facingX = dirX
    hunter.facingY = dirY

    const travel = speed * step
    const beforeX = hunter.x
    const beforeY = hunter.y

    // Straight-line pursuit with per-axis sliding. There is still no pathfinding,
    // so they catch on the outside corners of buildings — but searching now sends
    // them to a remembered point rather than to the player, so getting stuck is a
    // way to be escaped rather than a permanent lock.
    const nextX = hunter.x + dirX * travel
    if (!blocked(grid, nextX, hunter.y, 0.3)) hunter.x = nextX

    const nextY = hunter.y + dirY * travel
    if (!blocked(grid, hunter.x, nextY, 0.3)) hunter.y = nextY

    hunter.moving = hunter.x !== beforeX || hunter.y !== beforeY
  }

  return {
    hunters,

    get noticedFor() {
      return noticedFor
    },

    update(
      grid: Grid,
      actor: Actor,
      torchOn: boolean,
      step: number,
      darkness: number,
      rng: Rng,
    ): boolean {
      noticedFor = Math.max(0, noticedFor - step)

      // Daylight unmakes them entirely. Not a fade — they are simply not there.
      if (darkness < 0.35) {
        hunters.length = 0
        untilSpawn = 8
        return false
      }

      untilSpawn -= step * darkness
      if (untilSpawn <= 0) {
        untilSpawn = SPAWN_INTERVAL
        if (hunters.length < MAX_HUNTERS) spawn(grid, actor, rng)
      }

      const playerSafe = isLit(grid, actor.x, actor.y)
      const heardFrom = noiseRadius(actor)
      let caught = false

      for (let i = hunters.length - 1; i >= 0; i--) {
        const hunter = hunters[i]
        if (hunter === undefined) continue

        const dx = actor.x - hunter.x
        const dy = actor.y - hunter.y
        const distance = Math.hypot(dx, dy)

        if (distance > DESPAWN_RANGE) {
          hunters.splice(i, 1)
          continue
        }

        // Light takes them apart. Not instantly, so a lamp reads as somewhere to
        // retreat to rather than a wall they cannot cross.
        if (isLit(grid, hunter.x, hunter.y)) {
          hunter.exposure += step
          if (hunter.exposure >= EXPOSURE_LIMIT) {
            hunters.splice(i, 1)
            continue
          }
        } else {
          hunter.exposure = Math.max(0, hunter.exposure - step * 0.5)
        }

        // Perception. Sight needs an unobstructed line, which is what makes
        // putting a building between you and one of them actually work. A lit
        // torch is visible from far further than a body — the trade for being
        // able to see is being seen.
        const seen =
          !playerSafe &&
          distance <= (torchOn ? TORCH_SIGHT_RANGE : SIGHT_RANGE) &&
          hasLineOfSight(grid, hunter.x, hunter.y, actor.x, actor.y)

        // Noise passes through walls; that is the point of having a second sense.
        const heard = !playerSafe && heardFrom > 0 && distance <= heardFrom

        if (seen || heard) {
          if (hunter.state !== HunterState.Hunting) {
            // Only the moment of first noticing raises the cue, or it would be on
            // permanently while anything was chasing.
            noticedFor = 1.6
          }
          hunter.state = HunterState.Hunting
          hunter.targetX = actor.x
          hunter.targetY = actor.y
          hunter.patience = SEARCH_PATIENCE
        } else if (hunter.state === HunterState.Hunting) {
          // Lost. It keeps going to where you were, which is what makes breaking
          // line of sight worth doing.
          hunter.state = HunterState.Searching
        }

        if (distance <= CATCH_RANGE && !playerSafe) {
          caught = true
          continue
        }

        switch (hunter.state) {
          case HunterState.Hunting:
            advance(grid, hunter, SPEED_HUNTING, step)
            break

          case HunterState.Searching: {
            hunter.patience -= step

            const toTarget = Math.hypot(hunter.targetX - hunter.x, hunter.targetY - hunter.y)
            if (toTarget < ARRIVED) {
              // Arrived at where you were and found nothing. Casts about nearby
              // rather than standing still, so a search sweeps an area.
              hunter.targetX = hunter.x + (rng.next() - 0.5) * 12
              hunter.targetY = hunter.y + (rng.next() - 0.5) * 12
            }

            if (hunter.patience <= 0) hunter.state = HunterState.Wandering
            advance(grid, hunter, SPEED_SEARCHING, step)
            break
          }

          case HunterState.Suspicious:
          case HunterState.Wandering: {
            const toTarget = Math.hypot(hunter.targetX - hunter.x, hunter.targetY - hunter.y)
            if (toTarget < ARRIVED) {
              hunter.targetX = hunter.x + (rng.next() - 0.5) * 20
              hunter.targetY = hunter.y + (rng.next() - 0.5) * 20
            }
            advance(grid, hunter, SPEED_WANDERING, step)
            break
          }
        }
      }

      return caught
    },

    clear(): void {
      hunters.length = 0
      untilSpawn = 8
      noticedFor = 0
    },
  }
}
