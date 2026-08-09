import { describe, expect, it } from 'vitest'
import { createActor } from '@/entity/actor'
import { blocked, moveActor } from '@/entity/movement'
import { createGrid } from '@/world/grid'
import { Tile } from '@/world/tiles'
import { blocksMovement, Wall, WallSide, type WallSideId } from '@/world/walls'
import { createSandbox, SPAWN } from '@/world/sandbox'

const STEP = 1 / 60

/** Open ground with a single north-facing wall on the boundary above tile (5, 5). */
function roomWithWall() {
  const grid = createGrid(12, 12, Tile.Grass)
  grid.setWall(5, 5, WallSide.North, Wall.Solid)
  return grid
}

describe('collision', () => {
  it('closes the edge of the map', () => {
    const grid = createGrid(8, 8, Tile.Grass)

    expect(blocked(grid, 0.1, 4, 0.28)).toBe(true)
    expect(blocked(grid, 4, 7.95, 0.28)).toBe(true)
    expect(blocked(grid, 4, 4, 0.28)).toBe(false)
  })

  it('detects a wall by the actor circle, not just its centre', () => {
    const grid = roomWithWall()

    // The wall lies along y = 5, spanning x 5 to 6. A centre just below it is clear,
    // but the radius still reaches the segment.
    expect(blocked(grid, 5.5, 5.2, 0.28)).toBe(true)
    expect(blocked(grid, 5.5, 5.5, 0.28)).toBe(false)
  })

  it('does not block alongside the end of a wall segment', () => {
    const grid = roomWithWall()

    // Well clear of the segment's span in x, so nothing should be in the way.
    expect(blocked(grid, 7.5, 5.0, 0.28)).toBe(false)
  })

  it('treats a window as solid, since only sight passes through it', () => {
    const grid = createGrid(8, 8, Tile.Grass)
    grid.setWall(4, 4, WallSide.North, Wall.Window)

    expect(blocked(grid, 4.5, 4.1, 0.28)).toBe(true)
  })

  it('lets an open boundary through — this is what a doorway is', () => {
    const grid = createGrid(8, 8, Tile.Grass)
    grid.setWall(4, 4, WallSide.North, Wall.None)

    expect(blocked(grid, 4.5, 4.0, 0.28)).toBe(false)
  })
})

describe('movement', () => {
  it('cannot cross a wall from any of the eight directions', () => {
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
      const grid = createGrid(12, 12, Tile.Grass)
      // Box tile (5, 5) in on all four sides.
      grid.setWall(5, 5, WallSide.North, Wall.Solid)
      grid.setWall(5, 5, WallSide.West, Wall.Solid)
      grid.setWall(5, 6, WallSide.North, Wall.Solid)
      grid.setWall(6, 5, WallSide.West, Wall.Solid)

      const actor = createActor(5.5, 5.5)

      for (let i = 0; i < 600; i++) {
        moveActor(actor, grid, dx, dy, STEP)
      }

      // Still inside the sealed tile: walls were never crossed.
      expect(actor.x).toBeGreaterThan(5)
      expect(actor.x).toBeLessThan(6)
      expect(actor.y).toBeGreaterThan(5)
      expect(actor.y).toBeLessThan(6)
    }
  })

  it('does not tunnel through a wall at implausible speed', () => {
    const grid = roomWithWall()
    const actor = createActor(5.5, 7)
    // Nearly 7 tiles per step — far past anything a person would move, but exactly
    // the case that breaks collision that only tests its destination.
    actor.walkSpeed = 400

    for (let i = 0; i < 20; i++) {
      moveActor(actor, grid, 0, -1, STEP)
    }

    expect(actor.y).toBeGreaterThan(5)
  })

  it('slides along a wall instead of stopping dead', () => {
    const grid = roomWithWall()
    const actor = createActor(5.2, 5.4)
    const startX = actor.x

    // Pushed diagonally into the wall above: the y component is refused, but x
    // should still carry the actor along it.
    for (let i = 0; i < 30; i++) {
      moveActor(actor, grid, 0.707, -0.707, STEP)
    }

    expect(actor.x).toBeGreaterThan(startX)
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

  it('leaves every room in every building reachable on foot', () => {
    const grid = createSandbox()

    // Flood fill from spawn, crossing only boundaries without a solid wall. This is
    // the test that matters most now buildings are subdivided: a dividing wall drawn
    // without its doorway seals a room, which no other check would notice and which
    // is invisible from outside.
    const reached = floodFill(grid, Math.floor(SPAWN.x), Math.floor(SPAWN.y))

    let interior = 0
    let reachedInterior = 0
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.buildingAt(x, y) === 0) continue
        interior++
        if (reached.has(`${String(x)},${String(y)}`)) reachedInterior++
      }
    }

    expect(interior).toBeGreaterThan(0)
    expect(reachedInterior).toBe(interior)
  })

  it('builds the six houses of the block', () => {
    const grid = createSandbox()

    const ids = new Set<number>()
    let roofed = 0
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const id = grid.buildingAt(x, y)
        if (id === 0) continue
        ids.add(id)
        if (grid.roofAt(x, y) !== 0) roofed++
      }
    }

    expect([...ids].sort((m, n) => m - n)).toEqual([1, 2, 3, 4, 5, 6])
    expect(roofed).toBeGreaterThan(0)
  })

  it('produces the same block every time', () => {
    // The workshop block is authored, not generated: the seed is deliberately
    // ignored, and the same world comes back whatever it is. When generation
    // returns, so does the assertion that different seeds differ.
    const a = createSandbox(1234)
    const b = createSandbox(9999)

    const signature = (grid: ReturnType<typeof createSandbox>): string => {
      let out = ''
      for (let y = 0; y < grid.height; y += 3) {
        for (let x = 0; x < grid.width; x += 3) {
          out += String(grid.at(x, y)) + String(grid.buildingAt(x, y) === 0 ? 0 : 1)
        }
      }
      return out
    }

    expect(signature(a)).toBe(signature(b))
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
    if (seen.has(key) || !grid.contains(x, y)) continue

    seen.add(key)

    // Movement between tiles is refused by the wall on the boundary they share.
    // Asking blocksMovement rather than comparing to None matters now doorways
    // exist: a doorway is a wall with a hole in the bottom, not an absent wall,
    // and treating it as solid here would report every interior as sealed.
    const open = (tx: number, ty: number, side: WallSideId): boolean =>
      !blocksMovement(grid.wallAt(tx, ty, side))

    if (open(x, y, WallSide.West)) queue.push([x - 1, y])
    if (open(x + 1, y, WallSide.West)) queue.push([x + 1, y])
    if (open(x, y, WallSide.North)) queue.push([x, y - 1])
    if (open(x, y + 1, WallSide.North)) queue.push([x, y + 1])
  }

  return seen
}

describe('running', () => {
  it('covers more ground than walking over the same time', () => {
    const grid = createGrid(40, 40, Tile.Grass)

    const walker = createActor(20, 20)
    const runner = createActor(20, 20)

    for (let i = 0; i < 60; i++) {
      moveActor(walker, grid, 1, 0, STEP, false)
      moveActor(runner, grid, 1, 0, STEP, true)
    }

    expect(runner.x).toBeGreaterThan(walker.x)
  })

  it('only counts as running while actually moving', () => {
    const grid = createGrid(12, 12, Tile.Grass)
    grid.setWall(6, 5, WallSide.West, Wall.Solid)

    const actor = createActor(5.5, 5.5)

    // Held against a wall with the run key down: no ground covered, so no run
    // animation should play.
    for (let i = 0; i < 30; i++) {
      moveActor(actor, grid, 1, 0, STEP, true)
    }

    expect(actor.running).toBe(false)

    // And releasing the keys clears it too.
    moveActor(actor, grid, 0, 0, STEP, true)
    expect(actor.running).toBe(false)
    expect(actor.moving).toBe(false)
  })
})
