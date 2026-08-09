import { createGrid, type Grid } from '@/world/grid'
import { buildHouse, HOUSE_H } from '@/world/house'
import { LampCondition, Prop } from '@/world/props'
import { Tile } from '@/world/tiles'

/**
 * The workshop block.
 *
 * One city block, deliberately: two streets, six copies of the hand-built
 * house, five lamp posts, and nothing else. The island this replaces is still
 * in the history (`git log -- src/world/sandbox.ts`); it comes back when the
 * pieces being workshopped here — the house, the furnishing, the street feel —
 * are right at this scale. Tuning a neighbourhood is a block-sized job, and a
 * thousand-tile island around it was only making every look at it longer.
 *
 * Every house faces south, because the house plan is authored data and does
 * not rotate. The block is laid out to make that true to life anyway: two
 * east-west streets, a row of three houses fronting each.
 */

export const SANDBOX_WIDTH = 80
export const SANDBOX_HEIGHT = 80

export const SANDBOX_SEED = 20260808

/** Where each row of houses starts. A house is 12x9; doors are on the south. */
const HOUSE_XS = [16, 34, 52] as const
const HOUSE_ROWS = [8, 36] as const

/** The streets the rows front onto. Four lanes of asphalt, two of pavement. */
const STREETS = [
  { top: 20, bottom: 23 },
  { top: 48, bottom: 51 },
] as const

const PAVEMENT = 2

/**
 * Five lamps, placed by hand like everything else here. Two per street on
 * opposite pavements, and one mid-block in the grass to the west — enough to
 * light the walk between any two doors, never enough to light the block.
 */
const LAMPS: readonly { x: number; y: number; condition: number }[] = [
  { x: 20, y: 18, condition: LampCondition.Intact },
  { x: 46, y: 25, condition: LampCondition.Damaged },
  { x: 28, y: 46, condition: LampCondition.Intact },
  { x: 56, y: 53, condition: LampCondition.Broken },
  // The odd one out stands mid-block on the grass, where a path lamp would.
  { x: 13, y: 33, condition: LampCondition.Intact },
]

/** How many homes the block holds, for the tests that hold it to that. */
export const HOUSES = HOUSE_XS.length * HOUSE_ROWS.length

/** How many lamps light it. */
export const LAMP_COUNT = LAMPS.length

/** On the pavement in front of the middle house of the southern row. */
export const SPAWN = { x: HOUSE_XS[1] + 8.5, y: 46.5 } as const

export function createSandbox(seed: number = SANDBOX_SEED): Grid {
  // The seed stays in the signature for the day generation is random again;
  // the workshop block is the same block every time on purpose.
  void seed

  const grid = createGrid(SANDBOX_WIDTH, SANDBOX_HEIGHT, Tile.Grass)

  for (const street of STREETS) {
    for (let y = street.top; y <= street.bottom; y++) {
      for (let x = 0; x < grid.width; x++) grid.set(x, y, Tile.Road)
    }
    for (let offset = 1; offset <= PAVEMENT; offset++) {
      for (let x = 0; x < grid.width; x++) {
        grid.set(x, street.top - offset, Tile.Sidewalk)
        grid.set(x, street.bottom + offset, Tile.Sidewalk)
      }
    }
  }

  let id = 1
  for (const [row, y] of HOUSE_ROWS.entries()) {
    const street = STREETS[row]
    for (const x of HOUSE_XS) {
      buildHouse(grid, x, y, id)
      id++

      // A path from the front door to the pavement, worn rather than paved.
      const doorX = x + 8
      if (street !== undefined) {
        for (let py = y + HOUSE_H; py < street.top - PAVEMENT; py++) {
          grid.set(doorX, py, Tile.Dirt)
        }
      }
    }
  }

  for (const lamp of LAMPS) {
    grid.setProp(lamp.x, lamp.y, Prop.LampPost, lamp.condition)
  }

  return grid
}
