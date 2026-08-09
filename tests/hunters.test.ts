import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createActor } from '@/entity/actor'
import { createHunterPack, HunterState, type Hunter } from '@/entity/hunters'
import { createGrid } from '@/world/grid'
import { hasLineOfSight } from '@/world/vision'
import { Prop } from '@/world/props'
import { Tile } from '@/world/tiles'
import { Wall, WallSide } from '@/world/walls'

const STEP = 1 / 60

function openGround() {
  return createGrid(80, 80, Tile.Grass)
}

/** Places one hunter at a known spot with a known state. */
function packWith(x: number, y: number) {
  const pack = createHunterPack()
  const grid = openGround()
  const actor = createActor(40, 40)
  const rng = createRng(1)

  // Take control of the pack's contents so a test can place one hunter exactly
  // where it needs it. Spawning is random and distant by design, which is right for
  // the game and useless for testing perception.
  pack.update(grid, actor, false, STEP, 1, rng)
  const mutable = pack.hunters as unknown as Hunter[]
  mutable.length = 0
  mutable.push({
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
    travelled: 0,
  })

  return { pack, grid, actor, rng }
}

describe('line of sight', () => {
  it('sees across open ground', () => {
    expect(hasLineOfSight(openGround(), 10, 10, 20, 20)).toBe(true)
  })

  it('is blocked by an opaque wall', () => {
    const grid = openGround()
    for (let y = 8; y < 20; y++) grid.setWall(15, y, WallSide.West, Wall.Solid)

    expect(hasLineOfSight(grid, 12, 12, 18, 12)).toBe(false)
  })

  it('passes through a doorway in that same wall', () => {
    const grid = openGround()
    for (let y = 8; y < 20; y++) grid.setWall(15, y, WallSide.West, Wall.Solid)
    grid.setWall(15, 12, WallSide.West, Wall.None)

    // Straight through the gap. If this failed, doorways would be walls to sight
    // and hiding behind a building would be indistinguishable from standing in it.
    expect(hasLineOfSight(grid, 12, 12.5, 18, 12.5)).toBe(true)
  })

  it('is blocked by a dense canopy', () => {
    const grid = openGround()
    grid.setProp(15, 12, Prop.Pine, 0)

    expect(hasLineOfSight(grid, 12, 12.5, 18, 12.5)).toBe(false)
  })
})

describe('perception', () => {
  it('ignores a still player standing in the dark just out of sight', () => {
    const { pack, grid, actor, rng } = packWith(52, 40)
    actor.moving = false

    for (let i = 0; i < 60; i++) pack.update(grid, actor, false, STEP, 1, rng)

    expect(pack.hunters[0]?.state).not.toBe(HunterState.Hunting)
  })

  it('hears a running player through a wall it cannot see through', () => {
    const { pack, grid, actor, rng } = packWith(46, 40)
    for (let y = 36; y < 46; y++) grid.setWall(43, y, WallSide.West, Wall.Solid)

    actor.moving = true
    actor.running = true

    pack.update(grid, actor, false, STEP, 1, rng)

    // Sound does not care about walls. That is the point of a second sense.
    expect(pack.hunters[0]?.state).toBe(HunterState.Hunting)
  })

  it('sees a lit torch from far beyond body range', () => {
    const { pack, grid, actor, rng } = packWith(55, 40)
    actor.moving = false

    pack.update(grid, actor, false, STEP, 1, rng)
    expect(pack.hunters[0]?.state).not.toBe(HunterState.Hunting)

    pack.update(grid, actor, true, STEP, 1, rng)
    expect(pack.hunters[0]?.state).toBe(HunterState.Hunting)
  })

  it('searches where the player was rather than where they are', () => {
    const { pack, grid, actor, rng } = packWith(44, 40)
    actor.moving = true
    actor.running = true

    pack.update(grid, actor, false, STEP, 1, rng)
    expect(pack.hunters[0]?.state).toBe(HunterState.Hunting)

    // Vanish: stop moving and teleport well away. It should not follow.
    actor.moving = false
    actor.running = false
    actor.x = 12
    actor.y = 12

    pack.update(grid, actor, false, STEP, 1, rng)
    const hunter = pack.hunters[0]

    expect(hunter?.state).toBe(HunterState.Searching)
    expect(Math.hypot((hunter?.targetX ?? 0) - 12, (hunter?.targetY ?? 0) - 12)).toBeGreaterThan(20)
  })

  it('gives up eventually and stops searching', () => {
    const { pack, grid, actor, rng } = packWith(44, 40)
    actor.moving = true
    actor.running = true
    pack.update(grid, actor, false, STEP, 1, rng)

    actor.moving = false
    actor.running = false
    actor.x = 5
    actor.y = 5

    for (let i = 0; i < 60 * 20; i++) pack.update(grid, actor, false, STEP, 1, rng)

    expect(pack.hunters[0]?.state).toBe(HunterState.Wandering)
  })

  it('does not exist in daylight', () => {
    const { pack, grid, actor, rng } = packWith(44, 40)

    pack.update(grid, actor, false, STEP, 0, rng)

    expect(pack.hunters.length).toBe(0)
  })
})
