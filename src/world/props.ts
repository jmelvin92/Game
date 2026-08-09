/**
 * Props: things standing on a tile that are not part of the building.
 *
 * Trees and bushes for now. Kept separate from tiles because a prop sits *on* a
 * surface rather than being one — the grass under a tree is still grass, and it
 * needs to keep being grass when the tree is cut down or burnt.
 *
 * As everywhere in `world/`, nothing here describes appearance.
 */

export const Prop = {
  None: 0,
  Tree: 1,
  Bush: 2,
} as const

export type PropId = (typeof Prop)[keyof typeof Prop]

export interface PropDef {
  readonly name: string
  /** Blocks movement. */
  readonly solid: boolean
  /** Blocks sight. Unused until line-of-sight exists. */
  readonly opaque: boolean
  /** Radius in tiles for collision. Only meaningful when solid. */
  readonly radius: number
}

const DEFS: Readonly<Record<PropId, PropDef>> = {
  [Prop.None]: { name: 'none', solid: false, opaque: false, radius: 0 },
  // A trunk is narrow, so the blocked circle is much smaller than the canopy that
  // hangs over it. Blocking the whole tile would make woodland impassable and feel
  // wrong long before it looked wrong.
  [Prop.Tree]: { name: 'tree', solid: true, opaque: true, radius: 0.22 },
  [Prop.Bush]: { name: 'bush', solid: false, opaque: false, radius: 0 },
}

export function propDef(id: PropId): PropDef {
  return DEFS[id]
}
