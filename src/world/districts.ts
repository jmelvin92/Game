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
  /** Open land north of the town. Nothing is built here. */
  Countryside: 3,
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
  [District.Countryside]: { name: 'countryside', lotFill: 0 },
}

export function districtDef(id: DistrictId): DistrictDef {
  return DEFS[id]
}

/**
 * Which district a point falls in.
 *
 * Laid out deliberately rather than generated: commerce clusters where the roads
 * cross, industry sits out on one edge away from the housing, the rest is
 * residential, and everything north of the town is open country. That is roughly
 * how towns actually arrange themselves, and it means the map reads as a place
 * rather than a patchwork.
 *
 * @param townTop first row of the town; everything above it is countryside
 * @param townCentreX horizontal middle of the town
 * @param townCentreY vertical middle of the town, which is not the middle of the map
 */
export function districtAt(
  x: number,
  y: number,
  townWidth: number,
  townTop: number,
  townCentreX: number,
  townCentreY: number,
): DistrictId {
  if (y < townTop) return District.Countryside

  const fromCentre = Math.max(Math.abs(x - townCentreX), Math.abs(y - townCentreY))
  if (fromCentre < townWidth * 0.18) return District.Commercial

  // Industry occupies one corner, far from the middle and downwind of the housing.
  if (x > townWidth * 0.62 && y > townCentreY + townWidth * 0.12) return District.Industrial

  return District.Residential
}
