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
  [Prop.LampPost]: { radius: 4.6, strength: 1, height: 1.6 },
}

export function propLight(id: PropId): PropLight | undefined {
  return LIGHTS[id]
}

/**
 * What state a lamp is in, stored as its prop variant.
 *
 * A world fact rather than a rendering one: whether a street is lit changes what
 * can be seen and, eventually, where it is safe to walk. How a flicker *looks* is
 * the renderer's business, but whether the lamp is broken is not.
 */
export const LampState = {
  Working: 0,
  Flickering: 1,
  Broken: 2,
} as const

export type LampStateId = (typeof LampState)[keyof typeof LampState]

export function propDef(id: PropId): PropDef {
  return DEFS[id]
}
