import { describe, expect, it } from 'vitest'
import { createActor } from '@/entity/actor'
import { blocked, moveActor } from '@/entity/movement'
import { createGrid } from '@/world/grid'
import { Tile } from '@/world/tiles'
import { createSandbox, SPAWN } from '@/world/sandbox'

const STEP = 1 / 60

/** Open ground with a single wall at (5, 5). */
function roomWithWall() {
  const grid = createGrid(12, 12, Tile.Grass)
  grid.set(5, 5, Tile.Wall)
  return grid
}

describe('collision', () => {
  it('treats out-of-bounds as solid, giving the map a closed edge', () => {
    const grid = createGrid(4, 4, Tile.Grass)

    expect(blocked(grid, -0.5, 2, 0.28)).toBe(true)
    expect(blocked(grid, 2, 4.5, 0.28)).toBe(true)
    expect(blocked(grid, 2, 2, 0.28)).toBe(false)
  })

  it('detects a wall by the actor circle, not just its centre', () => {
    const grid = roomWithWall()

    // Centre sits in the open tile next door, but the radius reaches into the wall.
    expect(blocked(grid, 4.85, 5.5, 0.28)).toBe(true)
    expect(blocked(grid, 4.5, 5.5, 0.28)).toBe(false)
  })
})

describe('movement', () => {
  it('cannot pass through a wall from any of the eight directions', () => {
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const

    for (const [dx, dy] of directions) {
      const grid = roomWithWall()
      const actor = createActor(5.5 - dx * 2, 5.5 - dy * 2)

      const length = Math.hypot(dx, dy)
      // Long enough to cross the wall several times over if collision failed.
      for (let i = 0; i < 600; i++) {
        moveActor(actor, grid, dx / length, dy / length, STEP)
      }

      expect(blocked(grid, actor.x, actor.y, actor.radius)).toBe(false)
    }
  })

  it('does not tunnel through a wall at implausible speed', () => {
    const grid = roomWithWall()
    const actor = createActor(3.5, 5.5)
    // Nearly 7 tiles per step — far past anything a person would move, but exactly
    // the case that breaks collision that only tests its destination.
    actor.speed = 400

    for (let i = 0; i < 20; i++) {
      moveActor(actor, grid, 1, 0, STEP)
    }

    expect(actor.x).toBeLessThan(5)
    expect(blocked(grid, actor.x, actor.y, actor.radius)).toBe(false)
  })

  it('slides along a wall instead of stopping dead', () => {
    const grid = roomWithWall()
    const actor = createActor(4.5, 4.2)
    const startY = actor.y

    // Pushing diagonally into the wall's left face: the x component is refused,
    // but the y component should still carry the actor along it.
    for (let i = 0; i < 30; i++) {
      moveActor(actor, grid, 0.707, 0.707, STEP)
    }

    expect(actor.y).toBeGreaterThan(startY)
  })

  it('keeps facing when the keys are released', () => {
    const grid = createGrid(8, 8, Tile.Grass)
    const actor = createActor(4, 4)

    moveActor(actor, grid, -1, 0, STEP)
    const { facingX, facingY } = actor

    moveActor(actor, grid, 0, 0, STEP)

    expect(actor.facingX).toBe(facingX)
    expect(actor.facingY).toBe(facingY)
    expect(actor.moving).toBe(false)
  })
})

describe('sandbox', () => {
  it('spawns the character somewhere they can stand', () => {
    const grid = createSandbox()
    const actor = createActor(SPAWN.x, SPAWN.y)

    expect(blocked(grid, actor.x, actor.y, actor.radius)).toBe(false)
  })

  it('gives every building a doorway wide enough to walk through', () => {
    const grid = createSandbox()

    // Each building's interior should be reachable from the spawn point. A flood
    // fill from spawn across walkable tiles must reach every floor tile; if a
    // doorway were missed or too narrow, some interior would be sealed off.
    const reached = floodFill(grid, Math.floor(SPAWN.x), Math.floor(SPAWN.y))

    let floors = 0
    let reachedFloors = 0
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.at(x, y) !== Tile.Floor) continue
        floors++
        if (reached.has(`${String(x)},${String(y)}`)) reachedFloors++
      }
    }

    expect(floors).toBeGreaterThan(0)
    expect(reachedFloors).toBe(floors)
  })
})

function floodFill(
  grid: ReturnType<typeof createGrid>,
  startX: number,
  startY: number,
): Set<string> {
  const seen = new Set<string>()
  const queue: [number, number][] = [[startX, startY]]

  while (queue.length > 0) {
    const next = queue.pop()
    if (next === undefined) break

    const [x, y] = next
    const key = `${String(x)},${String(y)}`
    if (seen.has(key)) continue
    if (!grid.contains(x, y)) continue
    if (grid.at(x, y) === Tile.Wall) continue

    seen.add(key)
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }

  return seen
}
