import type { Actor } from '@/entity/actor'
import { blocked } from '@/entity/movement'
import type { Rng } from '@/core/rng'
import type { Grid } from '@/world/grid'
import { isLit } from '@/world/illumination'

/**
 * The White Eyes.
 *
 * They cannot hold together in light. That single rule is the whole design: it is
 * why the gift is worth its cost, why a lit lamp is worth walking to, and why the
 * dark between them is worth being afraid of.
 *
 * They do not exist at all during the day, and are only rarely found indoors then —
 * which is not built yet, and is the one place the daytime is meant to stop being
 * safe.
 */

export interface Hunter {
  x: number
  y: number
  facingX: number
  facingY: number
  speed: number
  /** Seconds it has spent standing in light. Enough of it and it comes apart. */
  exposure: number
  moving: boolean
}

/** Faster than a walk, slower than a sprint: you can outrun one, but not for long. */
const HUNTER_SPEED = 4.6

/** How close before it has you. */
const CATCH_RANGE = 0.55

/** Seconds in light before one comes apart. */
const EXPOSURE_LIMIT = 1.2

/** How many can be abroad at once. */
const MAX_HUNTERS = 6

/** Tiles from the player they appear at — beyond sight, close enough to matter. */
const SPAWN_MIN = 22
const SPAWN_MAX = 38

/** Beyond this they are forgotten, so the far side of the map is not being simulated. */
const DESPAWN_RANGE = 70

/** Seconds between attempts to add another, at full darkness. */
const SPAWN_INTERVAL = 9

export interface HunterPack {
  readonly hunters: readonly Hunter[]
  /**
   * Advances every hunter.
   *
   * @param darkness 0 in daylight through to 1 at night
   * @returns true if one of them reached the player
   */
  update(grid: Grid, actor: Actor, step: number, darkness: number, rng: Rng): boolean
  clear(): void
}

export function createHunterPack(): HunterPack {
  const hunters: Hunter[] = []
  let untilSpawn = 4

  const spawn = (grid: Grid, actor: Actor, rng: Rng): void => {
    // A handful of attempts, then give up until the next interval. Searching
    // harder than this would only find somewhere worse.
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = rng.next() * Math.PI * 2
      const distance = SPAWN_MIN + rng.next() * (SPAWN_MAX - SPAWN_MIN)
      const x = actor.x + Math.cos(angle) * distance
      const y = actor.y + Math.sin(angle) * distance

      if (x < 2 || y < 2 || x > grid.width - 2 || y > grid.height - 2) continue
      if (blocked(grid, x, y, 0.3)) continue
      // Never in light: they could not have formed there.
      if (isLit(grid, x, y)) continue

      hunters.push({
        x,
        y,
        facingX: 1,
        facingY: 1,
        speed: HUNTER_SPEED,
        exposure: 0,
        moving: false,
      })
      return
    }
  }

  return {
    hunters,

    update(grid: Grid, actor: Actor, step: number, darkness: number, rng: Rng): boolean {
      // Daylight unmakes them entirely. Not a fade — they are simply not there.
      if (darkness < 0.35) {
        hunters.length = 0
        untilSpawn = 4
        return false
      }

      untilSpawn -= step * darkness
      if (untilSpawn <= 0) {
        untilSpawn = SPAWN_INTERVAL
        if (hunters.length < MAX_HUNTERS) spawn(grid, actor, rng)
      }

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

        // Standing in light takes them apart. Not instantly — long enough that a
        // lamp reads as a place to retreat to rather than a wall they cannot cross.
        if (isLit(grid, hunter.x, hunter.y)) {
          hunter.exposure += step
          if (hunter.exposure >= EXPOSURE_LIMIT) {
            hunters.splice(i, 1)
            continue
          }
        } else {
          hunter.exposure = Math.max(0, hunter.exposure - step * 0.5)
        }

        // They will not enter light willingly, so someone standing under a working
        // lamp is left alone — watched, but not approached.
        const playerSafe = isLit(grid, actor.x, actor.y)

        if (playerSafe || distance < 0.001) {
          hunter.moving = false
          continue
        }

        if (distance <= CATCH_RANGE) {
          caught = true
          continue
        }

        const dirX = dx / distance
        const dirY = dy / distance

        hunter.facingX = dirX
        hunter.facingY = dirY

        // Straight-line pursuit with per-axis sliding, the same as the player's
        // movement. Real pathfinding is the obvious next step; without it they get
        // stuck on the corners of buildings, which is a limitation rather than a
        // behaviour and should not be mistaken for one.
        const travel = hunter.speed * step
        const nextX = hunter.x + dirX * travel
        if (!blocked(grid, nextX, hunter.y, 0.3)) hunter.x = nextX

        const nextY = hunter.y + dirY * travel
        if (!blocked(grid, hunter.x, nextY, 0.3)) hunter.y = nextY

        hunter.moving = true
      }

      return caught
    },

    clear(): void {
      hunters.length = 0
      untilSpawn = 4
    },
  }
}
