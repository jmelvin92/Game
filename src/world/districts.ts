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
  /** Open land. Nothing is built here by the block placer. */
  Countryside: 3,
  /** Dense rows of single-storey homes on dirt lots. */
  TrailerPark: 4,
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
  [District.TrailerPark]: { name: 'trailer park', lotFill: 0.8 },
}

export function districtDef(id: DistrictId): DistrictDef {
  return DEFS[id]
}
