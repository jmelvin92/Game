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
}

export function propDef(id: PropId): PropDef {
  return DEFS[id]
}
