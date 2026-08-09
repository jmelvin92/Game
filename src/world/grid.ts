import { Tile, type TileId } from '@/world/tiles'
import { Prop, type PropId } from '@/world/props'
import { Wall, type WallId, type WallSideId } from '@/world/walls'

/**
 * A fixed-size map: ground tiles, walls on tile boundaries, and the buildings those
 * walls enclose.
 *
 * Deliberately not chunked yet. Chunking exists to stop map size being bounded by
 * memory, which is not a problem a sandbox has.
 */
export interface Grid {
  readonly width: number
  readonly height: number

  at(x: number, y: number): TileId
  set(x: number, y: number, id: TileId): void
  contains(x: number, y: number): boolean

  /** The wall on the given boundary of this tile. See `walls.ts` for the sides. */
  wallAt(x: number, y: number, side: WallSideId): WallId
  setWall(
    x: number,
    y: number,
    side: WallSideId,
    id: WallId,
    style?: number,
    segments?: number,
  ): void

  /**
   * Which material a wall is made of.
   *
   * The simulation never interprets this — a wall's behaviour comes entirely from
   * its {@link WallId}. It is carried here only so the renderer can tell a brick
   * building from a timber one, and so that saving the map preserves it.
   */
  wallStyleAt(x: number, y: number, side: WallSideId): number

  /**
   * How many wall segments high this boundary stands.
   *
   * The art draws a segment roughly a metre tall, not a whole storey, so a
   * building is several stacked. This is what makes a wall taller than the person
   * standing next to it.
   */
  wallSegmentsAt(x: number, y: number, side: WallSideId): number

  /** Which building occupies this tile; 0 outdoors. Identifies interiors. */
  buildingAt(x: number, y: number): number
  setBuilding(x: number, y: number, id: number): void

  /** What stands on this tile — a tree, a bush — or {@link Prop.None}. */
  propAt(x: number, y: number): PropId
  setProp(x: number, y: number, id: PropId, variant?: number): void
  /** Which of the art's variants this prop uses, so a wood is not one tree cloned. */
  propVariantAt(x: number, y: number): number

  /** The roof over this tile; 0 for open sky. */
  roofAt(x: number, y: number): number
  /** How far this part of the roof rises above the eaves, in steps. */
  roofHeightAt(x: number, y: number): number
  setRoof(x: number, y: number, style: number, height?: number): void
}

export function createGrid(width: number, height: number, fill: TileId): Grid {
  const area = width * height

  const tiles = new Uint8Array(area).fill(fill)

  // One array per side. Storing both on the tile that owns them means every
  // boundary exists exactly once, so there is no pair of values to keep in step.
  const wallKind = [new Uint8Array(area), new Uint8Array(area)]
  const wallStyle = [new Uint8Array(area), new Uint8Array(area)]
  const wallSegments = [new Uint8Array(area), new Uint8Array(area)]

  const buildings = new Uint16Array(area)
  const roofs = new Uint8Array(area)
  const roofHeights = new Uint8Array(area)
  const props = new Uint8Array(area)
  const propVariants = new Uint8Array(area)

  const contains = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height

  return {
    width,
    height,
    contains,

    at(x: number, y: number): TileId {
      if (!contains(x, y)) return Tile.Grass
      return (tiles[y * width + x] ?? Tile.Grass) as TileId
    },

    set(x: number, y: number, id: TileId): void {
      if (!contains(x, y)) return
      tiles[y * width + x] = id
    },

    wallAt(x: number, y: number, side: WallSideId): WallId {
      if (!contains(x, y)) return Wall.None
      return (wallKind[side]?.[y * width + x] ?? Wall.None) as WallId
    },

    setWall(x: number, y: number, side: WallSideId, id: WallId, style = 0, segments = 1): void {
      if (!contains(x, y)) return

      const index = y * width + x
      const kinds = wallKind[side]
      const styles = wallStyle[side]
      const heights = wallSegments[side]

      if (kinds !== undefined) kinds[index] = id
      if (styles !== undefined) styles[index] = style
      if (heights !== undefined) heights[index] = segments
    },

    wallSegmentsAt(x: number, y: number, side: WallSideId): number {
      if (!contains(x, y)) return 0
      return wallSegments[side]?.[y * width + x] ?? 0
    },

    wallStyleAt(x: number, y: number, side: WallSideId): number {
      if (!contains(x, y)) return 0
      return wallStyle[side]?.[y * width + x] ?? 0
    },

    buildingAt(x: number, y: number): number {
      if (!contains(x, y)) return 0
      return buildings[y * width + x] ?? 0
    },

    setBuilding(x: number, y: number, id: number): void {
      if (!contains(x, y)) return
      buildings[y * width + x] = id
    },

    propAt(x: number, y: number): PropId {
      if (!contains(x, y)) return Prop.None
      return (props[y * width + x] ?? Prop.None) as PropId
    },

    setProp(x: number, y: number, id: PropId, variant = 0): void {
      if (!contains(x, y)) return
      props[y * width + x] = id
      propVariants[y * width + x] = variant
    },

    propVariantAt(x: number, y: number): number {
      if (!contains(x, y)) return 0
      return propVariants[y * width + x] ?? 0
    },

    roofAt(x: number, y: number): number {
      if (!contains(x, y)) return 0
      return roofs[y * width + x] ?? 0
    },

    roofHeightAt(x: number, y: number): number {
      if (!contains(x, y)) return 0
      return roofHeights[y * width + x] ?? 0
    },

    setRoof(x: number, y: number, style: number, height = 0): void {
      if (!contains(x, y)) return
      roofs[y * width + x] = style
      roofHeights[y * width + x] = height
    },
  }
}
