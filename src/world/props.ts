/**
 * Props: things standing on a tile that are not part of the building.
 *
 * Kept separate from tiles because a prop sits *on* a surface rather than being
 * one — the ground under a tree is still ground, and it needs to keep being ground
 * when the tree comes down or burns.
 *
 * As everywhere in `world/`, nothing here describes appearance. The distinction
 * between a willow and a pine matters to the simulation only through the handful
 * of properties below.
 */

export const Prop = {
  None: 0,
  /** Bare, dead. The most desolate of the set and the most common. */
  DeadTree: 1,
  /** Drooping, half-alive. */
  Willow: 2,
  /** Dark conifer. */
  Pine: 3,
  /** Sparse broadleaf, past its best. */
  Tree: 4,
  /** Low, grey-green, dry. Walkable. */
  Sagebrush: 5,
  /** Dry scrub. Walkable. */
  Scrub: 6,
  /** Street lighting. Whether it still works is a separate question. */
  LampPost: 7,
  /** A dead car, left where it stopped. Variant 0 faces along x, 1 along y. */
  CarWreck: 8,
  /** Domestic air-conditioning condenser, silent beside a house wall. */
  AirConditioner: 9,
  /** Bare rock. Desert and rocky ground furniture. */
  Boulder: 10,
  /** Airfield windsock, hanging dead — there is weather but no wind yet. */
  Windsock: 11,
} as const

export type PropId = (typeof Prop)[keyof typeof Prop]

/**
 * How many distinct variants of each species exist.
 *
 * Lives here rather than beside the art because the *choice* of variant is made
 * during generation and saved with the world; the renderer only looks it up.
 */
export const PROP_VARIANTS = 5

export interface PropDef {
  readonly name: string
  /** Blocks movement. */
  readonly solid: boolean
  /** Blocks sight. Unused until line-of-sight exists. */
  readonly opaque: boolean
  /** Radius in tiles for collision. Only meaningful when solid. */
  readonly radius: number
}

// Trunks block a circle much narrower than the canopy above them. Blocking the
// whole tile would make woodland impassable, which feels wrong long before it
// looks wrong. Low growth blocks nothing — walking through scrub should be free.
const DEFS: Readonly<Record<PropId, PropDef>> = {
  [Prop.None]: { name: 'none', solid: false, opaque: false, radius: 0 },
  [Prop.DeadTree]: { name: 'dead tree', solid: true, opaque: false, radius: 0.18 },
  [Prop.Willow]: { name: 'willow', solid: true, opaque: true, radius: 0.2 },
  [Prop.Pine]: { name: 'pine', solid: true, opaque: true, radius: 0.2 },
  [Prop.Tree]: { name: 'tree', solid: true, opaque: true, radius: 0.22 },
  [Prop.Sagebrush]: { name: 'sagebrush', solid: false, opaque: false, radius: 0 },
  [Prop.Scrub]: { name: 'scrub', solid: false, opaque: false, radius: 0 },
  [Prop.LampPost]: { name: 'lamp post', solid: true, opaque: false, radius: 0.12 },
  // A wreck blocks most of its tile: it is a thing you go around, not through.
  [Prop.CarWreck]: { name: 'car wreck', solid: true, opaque: false, radius: 0.42 },
  [Prop.AirConditioner]: { name: 'air conditioner', solid: true, opaque: false, radius: 0.18 },
  [Prop.Boulder]: { name: 'boulder', solid: true, opaque: false, radius: 0.3 },
  [Prop.Windsock]: { name: 'windsock', solid: true, opaque: false, radius: 0.1 },
}

/**
 * How much light a prop gives off, and how far.
 *
 * Kept beside the prop rather than in the renderer because whether something is
 * lit matters to the simulation — being seen at night is a game concern, not a
 * drawing one — even though nothing reads it that way yet.
 */
export interface PropLight {
  /** Radius in tiles. */
  readonly radius: number
  readonly strength: number
  /** Height above the ground in tiles, so the glow sits at the lamp not its foot. */
  readonly height: number
}

const LIGHTS: Partial<Readonly<Record<PropId, PropLight>>> = {
  [Prop.LampPost]: { radius: 7.5, strength: 1, height: 1.6 },
}

export function propLight(id: PropId): PropLight | undefined {
  return LIGHTS[id]
}

/**
 * The physical condition of a lamp, stored as its prop variant.
 *
 * Condition, not power state. Nothing in this world is energised on its own — the
 * grid is dead — so a lamp is only ever dark or lit by the player. What condition
 * decides is whether it *can* be lit, and how well it holds a charge once it is.
 */
export const LampCondition = {
  Intact: 0,
  /** Lights, but stutters the whole time it is running. */
  Damaged: 1,
  /** Cannot hold a charge at all until repaired. */
  Broken: 2,
} as const

export type LampConditionId = (typeof LampCondition)[keyof typeof LampCondition]

/**
 * Anything that runs on electricity.
 *
 * The gift is not a repair tool — it is the only source of power left, and this is
 * the list of what it can be spent on. A street lamp today; a jukebox, a vehicle, a
 * refrigerator later. They differ only in what they cost, how long they hold a
 * charge, and what they do while they hold it, so adding one is a table entry
 * rather than a new mechanic.
 */
export interface DeviceDef {
  readonly name: string
  /** Fraction of a full charge to energise it. */
  readonly cost: number
  /** Seconds it runs before going dark again. */
  readonly duration: number
}

const DEVICES: Partial<Readonly<Record<PropId, DeviceDef>>> = {
  [Prop.LampPost]: { name: 'street lamp', cost: 0.16, duration: 150 },
}

export function deviceDef(id: PropId): DeviceDef | undefined {
  return DEVICES[id]
}

export function propDef(id: PropId): PropDef {
  return DEFS[id]
}

/**
 * The nearest powerable device within reach of a position, or undefined.
 *
 * A world query rather than something the input layer works out, so anything that
 * needs to find something to energise asks the same question of the same place.
 */
export function nearestDevice(
  grid: {
    propAt(x: number, y: number): PropId
    propVariantAt(x: number, y: number): number
  },
  x: number,
  y: number,
  reach: number,
): { x: number; y: number; prop: PropId; condition: number } | undefined {
  const radius = Math.ceil(reach)
  let best: { x: number; y: number; prop: PropId; condition: number } | undefined
  let bestDistance = reach * reach

  for (let ty = Math.floor(y) - radius; ty <= Math.floor(y) + radius; ty++) {
    for (let tx = Math.floor(x) - radius; tx <= Math.floor(x) + radius; tx++) {
      const prop = grid.propAt(tx, ty)
      if (deviceDef(prop) === undefined) continue

      const dx = tx + 0.5 - x
      const dy = ty + 0.5 - y
      const distance = dx * dx + dy * dy
      if (distance > bestDistance) continue

      bestDistance = distance
      best = { x: tx, y: ty, prop, condition: grid.propVariantAt(tx, ty) }
    }
  }

  return best
}
