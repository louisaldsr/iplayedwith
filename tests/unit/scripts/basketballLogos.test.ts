/**
 * @jest-environment node
 *
 * sharp is a native module: it runs under node, not jsdom.
 */
import sharp from 'sharp'
import { removeWhiteBackground } from '../../../scripts/common/lib/logos'
import { logoFileName, publicLogoUrl } from '../../../scripts/basketball/lib/logos'

type Rgb = [number, number, number]
const WHITE: Rgb = [255, 255, 255]
const RED: Rgb = [200, 20, 20]
const PINK: Rgb = [228, 138, 138] // red anti-aliased half-way into white

/** A 9×9 crest: white margin, a red ring two pixels thick, white enclosed inside it, and one
 * anti-aliased pixel where the ring meets the margin. */
function crest(): Rgb[][] {
  const grid: Rgb[][] = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => WHITE))
  for (let y = 1; y <= 7; y++) {
    for (let x = 1; x <= 7; x++) {
      const inRing = x <= 2 || x >= 6 || y <= 2 || y >= 6
      if (inRing) grid[y][x] = RED
    }
  }
  grid[0][4] = PINK
  return grid
}

async function toPng(grid: Rgb[][]): Promise<Buffer> {
  const raw = Buffer.from(grid.flat().flat())
  return sharp(raw, { raw: { width: grid[0].length, height: grid.length, channels: 3 } })
    .png()
    .toBuffer()
}

async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)]
}

describe('removeWhiteBackground', () => {
  it('clears the white that reaches the border and keeps the crest opaque', async () => {
    const at = await pixels(await removeWhiteBackground(await toPng(crest())))
    expect(at(0, 0)[3]).toBe(0)
    expect(at(8, 8)[3]).toBe(0)
    expect(at(1, 1)).toEqual([...RED, 255])
  })

  it('keeps the white enclosed by the crest', async () => {
    const at = await pixels(await removeWhiteBackground(await toPng(crest())))
    expect(at(4, 4)).toEqual([...WHITE, 255])
  })

  it('un-blends an edge pixel from the white it was anti-aliased against', async () => {
    const at = await pixels(await removeWhiteBackground(await toPng(crest())))
    const [r, g, b, a] = at(4, 0)
    expect([r, g, b]).toEqual(RED) // the crest's colour, not pink
    expect(a).toBeGreaterThan(100) // about half covered
    expect(a).toBeLessThan(155)
  })
})

describe('logo paths', () => {
  it('keeps the source file name, served from public/', () => {
    const name = logoFileName('https://cdn.ssref.net/req/202609170/tlogo/bbr/BOS-1986.png')
    expect(name).toBe('BOS-1986.png')
    expect(publicLogoUrl(name)).toBe('/logos/basketball/BOS-1986.png')
  })

  it('refuses a URL that is not a Basketball-Reference crest', () => {
    expect(() => logoFileName('https://example.com/../../etc/passwd')).toThrow(/Unexpected/)
  })
})
