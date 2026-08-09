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

/**
 * How far a pixel may stray from the detected background and still be keyed out.
 * The renders have hard edges, but scaling and lossy re-encoding leave a thin
 * fringe; a small tolerance removes it without eating colours inside a texture.
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

/**
 * Finds the colour a sheet uses for empty space.
 *
 * Different packs pick different keys — the wall and floor art uses magenta, the
 * town facades use teal — and hard-coding one silently leaves the other's
 * background painted into the game. Sampling the border finds it either way,
 * since whatever colour surrounds the art is by definition the background.
 */
function detectKeyColour(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): readonly [number, number, number] | undefined {
  const counts = new Map<string, number>()
  const step = Math.max(1, Math.floor(Math.min(width, height) / 64))

  const sample = (x: number, y: number): void => {
    const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data
    if (a === undefined || a < 250) return
    const key = `${String(r)},${String(g)},${String(b)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  for (let x = 0; x < width; x += step) {
    sample(x, 0)
    sample(x, height - 1)
  }
  for (let y = 0; y < height; y += step) {
    sample(0, y)
    sample(width - 1, y)
  }

  let best: string | undefined
  let bestCount = 0
  for (const [colour, count] of counts) {
    if (count > bestCount) {
      best = colour
      bestCount = count
    }
  }

  if (best === undefined) return undefined
  const [r, g, b] = best.split(',').map(Number)
  return r === undefined || g === undefined || b === undefined ? undefined : [r, g, b]
}

/** Replaces the sheet's background colour with transparency, in place. */
function keyOutBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const key = detectKeyColour(ctx, width, height)
  if (key === undefined) return

  const [keyR, keyG, keyB] = key
  const image = ctx.getImageData(0, 0, width, height)
  const { data } = image

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0

    if (
      Math.abs(r - keyR) <= KEY_TOLERANCE &&
      Math.abs(g - keyG) <= KEY_TOLERANCE &&
      Math.abs(b - keyB) <= KEY_TOLERANCE
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

/**
 * Loads a character sheet laid out as a grid of directions and frames.
 *
 * Scaling happens here, once, rather than per draw: the source art is larger than
 * the game needs, and rescaling every frame would cost more than it is worth for
 * something that never changes.
 *
 * @param columns frames per direction
 * @param rows directions
 * @param scale applied to each frame after slicing
 * @returns frames indexed by row, then column
 */
export async function loadSpriteGrid(
  url: string,
  columns: number,
  rows: number,
  scale = 1,
): Promise<readonly (readonly HTMLCanvasElement[])[]> {
  const image = await loadImage(url)

  const frameWidth = Math.floor(image.width / columns)
  const frameHeight = Math.floor(image.height / rows)
  const outWidth = Math.round(frameWidth * scale)
  const outHeight = Math.round(frameHeight * scale)

  const grid: HTMLCanvasElement[][] = []

  for (let row = 0; row < rows; row++) {
    const frames: HTMLCanvasElement[] = []

    for (let column = 0; column < columns; column++) {
      const [frame, ctx] = createCanvas(outWidth, outHeight)

      // Smoothing off: this is pixel art, and interpolating it turns crisp edges
      // into mush at any scale that is not a whole number.
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(
        image,
        column * frameWidth,
        row * frameHeight,
        frameWidth,
        frameHeight,
        0,
        0,
        outWidth,
        outHeight,
      )

      frames.push(frame)
    }

    grid.push(frames)
  }

  return grid
}
