/**
 * Loads tile sheets and cuts them into individual tiles.
 *
 * Art is from the Screaming Brain Studios isometric packs (CC0) — see
 * ATTRIBUTION.md. Their sheets are true 2:1 isometric renders at 128×64, which is
 * why adopting them changed the tile size but not a line of the projection maths.
 *
 * The sheets ship with **magenta backgrounds rather than an alpha channel**, so
 * every tile has to be keyed to transparency at load time. Doing it once here, into
 * a canvas the renderer reuses, keeps it off the hot path entirely.
 */

/** Sheets use pure magenta as the transparency key. */
const KEY_R = 255
const KEY_G = 0
const KEY_B = 255

/**
 * How far a pixel may stray from pure magenta and still count as background.
 * The renders have hard edges, but JPEG-era tooling and scaling can leave a thin
 * fringe; a small tolerance removes it without eating the pinks inside a texture.
 */
const KEY_TOLERANCE = 40

export interface TileSheet {
  /** Tiles in reading order: left to right, top to bottom. */
  readonly tiles: readonly HTMLCanvasElement[]
  readonly tileWidth: number
  readonly tileHeight: number
}

function createCanvas(
  width: number,
  height: number,
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (ctx === null) throw new Error('2D canvas context unavailable')

  return [canvas, ctx]
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => {
      resolve(image)
    })
    image.addEventListener('error', () => {
      reject(new Error(`Failed to load tile sheet: ${url}`))
    })
    image.src = url
  })
}

/** Replaces the magenta key colour with transparency, in place. */
function keyOutBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height)
  const { data } = image

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0

    if (
      Math.abs(r - KEY_R) <= KEY_TOLERANCE &&
      Math.abs(g - KEY_G) <= KEY_TOLERANCE &&
      Math.abs(b - KEY_B) <= KEY_TOLERANCE
    ) {
      data[i + 3] = 0
    }
  }

  ctx.putImageData(image, 0, 0)
}

/**
 * Loads a sheet and slices it into a grid of `tileWidth` × `tileHeight` tiles.
 */
export async function loadTileSheet(
  url: string,
  tileWidth: number,
  tileHeight: number,
): Promise<TileSheet> {
  const image = await loadImage(url)

  // Key the whole sheet in one pass rather than per tile — one getImageData call
  // instead of one per tile, and the seams stay consistent.
  const [sheet, sheetCtx] = createCanvas(image.width, image.height)
  sheetCtx.drawImage(image, 0, 0)
  keyOutBackground(sheetCtx, image.width, image.height)

  const columns = Math.floor(image.width / tileWidth)
  const rows = Math.floor(image.height / tileHeight)
  const tiles: HTMLCanvasElement[] = []

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const [tile, tileCtx] = createCanvas(tileWidth, tileHeight)
      tileCtx.drawImage(
        sheet,
        column * tileWidth,
        row * tileHeight,
        tileWidth,
        tileHeight,
        0,
        0,
        tileWidth,
        tileHeight,
      )
      tiles.push(tile)
    }
  }

  return { tiles, tileWidth, tileHeight }
}

/** Loads several sheets concurrently, keyed by name. */
export async function loadTileSheets(
  sources: Readonly<Record<string, string>>,
  tileWidth: number,
  tileHeight: number,
): Promise<ReadonlyMap<string, TileSheet>> {
  const loaded = await Promise.all(
    Object.entries(sources).map(
      async ([name, url]) => [name, await loadTileSheet(url, tileWidth, tileHeight)] as const,
    ),
  )

  return new Map(loaded)
}
