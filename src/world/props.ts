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

  // Furniture. Variant is *facing* for these — 0 faces down-right on screen, 1
  // down-left — not art variety and not condition. Some are devices: a floor
  // lamp, a television and a refrigerator are things the gift can wake, which
  // is the whole reason to furnish a house in this game.
  Bed: 12,
  Wardrobe: 13,
  Nightstand: 14,
  Sofa: 15,
  CoffeeTable: 16,
  Television: 17,
  Bookshelf: 18,
  FloorLamp: 19,
  Fridge: 20,
  Stove: 21,
  Counter: 22,
  Sink: 23,
  Toilet: 24,
  Bath: 25,
  KitchenTable: 26,
  Chair: 27,
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
  // Furniture blocks a generous circle — squeezing between a bed and its wall
  // should not work — except the things you brush past: chairs and small tables.
  [Prop.Bed]: { name: 'bed', solid: true, opaque: false, radius: 0.46 },
  [Prop.Wardrobe]: { name: 'wardrobe', solid: true, opaque: false, radius: 0.4 },
  [Prop.Nightstand]: { name: 'nightstand', solid: true, opaque: false, radius: 0.28 },
  [Prop.Sofa]: { name: 'sofa', solid: true, opaque: false, radius: 0.44 },
  [Prop.CoffeeTable]: { name: 'coffee table', solid: true, opaque: false, radius: 0.3 },
  [Prop.Television]: { name: 'television', solid: true, opaque: false, radius: 0.3 },
  [Prop.Bookshelf]: { name: 'bookshelf', solid: true, opaque: false, radius: 0.38 },
  [Prop.FloorLamp]: { name: 'floor lamp', solid: true, opaque: false, radius: 0.14 },
  [Prop.Fridge]: { name: 'refrigerator', solid: true, opaque: false, radius: 0.36 },
  [Prop.Stove]: { name: 'stove', solid: true, opaque: false, radius: 0.36 },
  [Prop.Counter]: { name: 'counter', solid: true, opaque: false, radius: 0.38 },
  [Prop.Sink]: { name: 'sink', solid: true, opaque: false, radius: 0.34 },
  [Prop.Toilet]: { name: 'toilet', solid: true, opaque: false, radius: 0.26 },
  [Prop.Bath]: { name: 'bath', solid: true, opaque: false, radius: 0.44 },
  [Prop.KitchenTable]: { name: 'kitchen table', solid: true, opaque: false, radius: 0.34 },
  [Prop.Chair]: { name: 'chair', solid: false, opaque: false, radius: 0 },
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
  /** Light colour, as an rgba template with ALPHA where opacity goes. Absent
      means the renderer's warm default — most electric light is warm. */
  readonly colour?: string
}

const LIGHTS: Partial<Readonly<Record<PropId, PropLight>>> = {
  [Prop.LampPost]: { radius: 7.5, strength: 1, height: 1.6 },
  [Prop.FloorLamp]: { radius: 4.2, strength: 0.85, height: 1.1 },
  // A television lights a room the way nothing else does: cold, and enough.
  [Prop.Television]: {
    radius: 3.2,
    strength: 0.6,
    height: 0.6,
    colour: 'rgba(168, 196, 255, ALPHA)',
  },
  // The fridge's glow is the little strip of its door seal — barely a light,
  // but in a black kitchen barely is plenty.
  [Prop.Fridge]: { radius: 1.6, strength: 0.35, height: 0.5, colour: 'rgba(210, 226, 255, ALPHA)' },
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
  /**
   * Health slots the device holds while it burns.
   *
   * A loan, not a price: the slots come back the moment the device is switched
   * off. One for everything today; a vehicle or a whole building might one day
   * take more of you at once.
   */
  readonly slots: number
}

const DEVICES: Partial<Readonly<Record<PropId, DeviceDef>>> = {
  [Prop.LampPost]: { name: 'street lamp', slots: 1 },
  [Prop.FloorLamp]: { name: 'floor lamp', slots: 1 },
  [Prop.Television]: { name: 'television', slots: 1 },
  [Prop.Fridge]: { name: 'refrigerator', slots: 1 },
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
