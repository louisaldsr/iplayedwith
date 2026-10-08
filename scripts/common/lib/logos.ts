import sharp from 'sharp'

/**
 * Crests and logos often come on an opaque white background — Basketball-Reference's palette PNGs,
 * a JPEG on Wikipedia — which shows as a white tile on the game's dark theme. No CSS blend can
 * remove it there — anything that cancels the white also darkens the crest.
 *
 * So the background is removed once, at import time:
 *
 * 1. The white that touches the image border is flood-filled and made fully transparent. White
 *    INSIDE the crest (the Celtics' shamrock outline, a ball's seams) is enclosed and stays.
 * 2. The crest's outermost pixels, anti-aliased against that white, keep only their crest part:
 *    each is read as a blend of the crest colour just inside it and white, and becomes that colour
 *    at the matching opacity. Without this a light halo would ring every logo on a dark background;
 *    a solid edge equals its inner colour and is left untouched.
 *
 * A logo already transparent around it passes through unchanged: transparent pixels are not white.
 */
/** A pixel at least this light on every channel counts as background white. */
const WHITE_THRESHOLD = 235

export async function removeWhiteBackground(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const px = (x: number, y: number) => (y * width + x) * 4
  const isWhite = (i: number) =>
    data[i + 3] > 0 && data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD

  // 1. Flood fill from the border, through white only.
  const background = new Uint8Array(width * height)
  const queue: number[] = []
  const seed = (x: number, y: number) => {
    const n = y * width + x
    if (!background[n] && isWhite(n * 4)) {
      background[n] = 1
      queue.push(n)
    }
  }
  for (let x = 0; x < width; x++) {
    seed(x, 0)
    seed(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    seed(0, y)
    seed(width - 1, y)
  }
  while (queue.length > 0) {
    const n = queue.pop()!
    const x = n % width
    const y = (n - x) / width
    if (x > 0) seed(x - 1, y)
    if (x < width - 1) seed(x + 1, y)
    if (y > 0) seed(x, y - 1)
    if (y < height - 1) seed(x, y + 1)
  }

  // 2. Clear the background; then each edge pixel (crest touching background) is read as a blend of
  //    the crest colour just inside it and white, and keeps only its crest part.
  const edge = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = y * width + x
      if (background[n]) data[px(x, y) + 3] = 0
      else if (touches(background, width, height, x, y)) edge[n] = 1
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!edge[y * width + x]) continue
      const inner = innerColour(data, background, edge, width, height, x, y)
      if (!inner) continue // a crest one pixel thin: nothing inside to compare with, left as is
      const i = px(x, y)
      // P = a·F + (1 − a)·W, projected on W − F.
      const w = [255 - inner[0], 255 - inner[1], 255 - inner[2]]
      const p = [255 - data[i], 255 - data[i + 1], 255 - data[i + 2]]
      const norm = w[0] ** 2 + w[1] ** 2 + w[2] ** 2
      if (norm < 3 * 20 ** 2) continue // the crest is near-white there: no telling it from the background
      const coverage = Math.min(1, Math.max(0, (p[0] * w[0] + p[1] * w[1] + p[2] * w[2]) / norm))
      if (coverage >= 0.97) continue
      for (let c = 0; c < 3; c++) data[i + c] = inner[c]
      data[i + 3] = Math.round(data[i + 3] * coverage)
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

function touches(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) return true
    }
  }
  return false
}

/** The mean colour of the crest pixels around (x, y) that are neither background nor edge, within 2 px. */
function innerColour(
  data: Buffer,
  background: Uint8Array,
  edge: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number] | null {
  for (const radius of [1, 2]) {
    const sum = [0, 0, 0]
    let count = 0
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const n = ny * width + nx
        if (background[n] || edge[n]) continue
        for (let c = 0; c < 3; c++) sum[c] += data[n * 4 + c]
        count++
      }
    }
    if (count > 0) return [sum[0] / count, sum[1] / count, sum[2] / count].map(Math.round) as [number, number, number]
  }
  return null
}

/** How deep a frame drawn around the image may be, in pixels. */
const MAX_FRAME = 4

/**
 * The image without the thin frame some logos are drawn in — a grey or coloured line along the
 * image edge, around a white field (Stewart, Virgin, Amon). The frame walls the white in, so the
 * flood fill of `removeWhiteBackground` never reaches it: cropped first, the field is background.
 *
 * Cropped only when the outermost ring is not background and a ring at most `MAX_FRAME` pixels
 * deeper is almost all white or transparent. A logo that runs to the edge has no such ring and
 * comes back unchanged.
 */
export async function withoutFrame(image: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const background = (x: number, y: number) => {
    const i = (y * width + x) * 4
    return (
      data[i + 3] === 0 ||
      (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD)
    )
  }
  const ringShare = (depth: number) => {
    let total = 0
    let clear = 0
    for (let x = depth; x < width - depth; x++) {
      for (const y of [depth, height - 1 - depth]) {
        total++
        if (background(x, y)) clear++
      }
    }
    for (let y = depth + 1; y < height - 1 - depth; y++) {
      for (const x of [depth, width - 1 - depth]) {
        total++
        if (background(x, y)) clear++
      }
    }
    return total === 0 ? 0 : clear / total
  }

  if (ringShare(0) >= 0.5) return image
  for (let depth = 1; depth <= MAX_FRAME && 2 * depth < Math.min(width, height); depth++) {
    if (ringShare(depth) >= 0.9) {
      return sharp(image)
        .extract({ left: depth, top: depth, width: width - 2 * depth, height: height - 2 * depth })
        .png()
        .toBuffer()
    }
  }
  return image
}

/** What the game draws text in on its dark theme (`--text-primary`): the colour dark ink becomes. */
const INK_ON_DARK: [number, number, number] = [232, 234, 240]
/**
 * Below this luminance and this saturation, a pixel is dark ink — black or a grey, mid-greys
 * included: a 50% grey wordmark (Spyker) reads no better than a black one on the dark theme.
 */
const DARK_INK_LUMINANCE = 140
const DARK_INK_SATURATION = 0.35
/** The share of a logo's visible ink that must be dark for the logo to count as monochrome dark. */
const DARK_INK_SHARE = 0.9

/**
 * A logo drawn in dark ink — a black or grey wordmark, a silhouette (Aston Martin, Honda, Maserati)
 * — redrawn in the game's light text colour, opacity kept: on the dark theme the dark version is
 * invisible, light outline or not. Wikipedia does the same in its own dark mode (`skin-invert`).
 *
 * Only when almost all the ink is dark and colourless, and only the dark ink is redrawn: Brawn's
 * coloured "GP" keeps its colour. A logo that mixes black with more colour, or sits on a black tile
 * (McLaren, Penske), is left as it is — lightening it would remake the brand.
 */
export async function lightenDarkInk(image: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const isDarkInk = (i: number) => {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
    const max = Math.max(r, g, b)
    const saturation = max === 0 ? 0 : (max - Math.min(r, g, b)) / max
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < DARK_INK_LUMINANCE && saturation < DARK_INK_SATURATION
  }
  let ink = 0
  let dark = 0
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255
    if (alpha === 0) continue
    ink += alpha
    if (isDarkInk(i)) dark += alpha
  }
  if (ink === 0 || dark / ink < DARK_INK_SHARE) return image

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && isDarkInk(i)) [data[i], data[i + 1], data[i + 2]] = INK_ON_DARK
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}
