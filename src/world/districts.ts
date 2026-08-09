/**
 * Districts.
 *
 * A building's character should come from *where it is*, not from a dice roll.
 * A timber house belongs on a residential street and a windowless depot does not;
 * put a warehouse between two cottages and the town stops reading as a place.
 *
 * Districts are the mechanism for that: the generator asks what kind of area a lot
 * sits in and only considers buildings that belong there.
 */

export const District = {
  Residential: 0,
  Commercial: 1,
  Industrial: 2,
} as const

export type DistrictId = (typeof District)[keyof typeof District]

export interface DistrictDef {
  readonly name: string
  /** How much of a lot the building covers. Industrial sheds sprawl; houses leave gardens. */
  readonly lotFill: number
}

const DEFS: Readonly<Record<DistrictId, DistrictDef>> = {
  [District.Residential]: { name: 'residential', lotFill: 0.62 },
  [District.Commercial]: { name: 'commercial', lotFill: 0.82 },
  [District.Industrial]: { name: 'industrial', lotFill: 0.9 },
}

export function districtDef(id: DistrictId): DistrictDef {
  return DEFS[id]
}

/**
 * Which district a point falls in.
 *
 * Laid out deliberately rather than generated: commerce clusters at the centre
 * where the roads cross, industry sits out on one edge away from the housing, and
 * the rest is residential. That is roughly how towns actually arrange themselves,
 * and it means the map reads as a place rather than a patchwork.
 */
export function districtAt(x: number, y: number, size: number): DistrictId {
  const centre = size / 2
  const fromCentre = Math.max(Math.abs(x - centre), Math.abs(y - centre))

  if (fromCentre < size * 0.18) return District.Commercial

  // Industry occupies one corner, far from the middle.
  if (x > size * 0.62 && y > size * 0.62) return District.Industrial

  return District.Residential
}
