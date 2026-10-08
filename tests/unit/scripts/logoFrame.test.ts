/**
 * @jest-environment node
 *
 * sharp is a native module: it runs under node, not jsdom.
 */
import sharp from 'sharp'
import { lightenDarkInk, removeWhiteBackground, withoutFrame } from '../../../scripts/common/lib/logos'

type Rgb = [number, number, number]
const WHITE: Rgb = [255, 255, 255]
const RED: Rgb = [200, 20, 20]
const GREY: Rgb = [120, 120, 120]

/** A 10×10 image: `edge` on the outermost ring, `field` inside it, a red 2×2 mark in the middle. */
function image(edge: Rgb, field: Rgb): Buffer {
  const grid = Array.from({ length: 10 }, (_, y) =>
    Array.from({ length: 10 }, (_, x) => {
      if (x === 0 || y === 0 || x === 9 || y === 9) return edge
      if (x >= 4 && x <= 5 && y >= 4 && y <= 5) return RED
      return field
    }),
  )
  return Buffer.from(grid.flat().flat())
}

const png = (raw: Buffer) =>
  sharp(raw, { raw: { width: 10, height: 10, channels: 3 } })
    .png()
    .toBuffer()
const size = async (buf: Buffer) => {
  const { width, height } = await sharp(buf).metadata()
  return [width, height]
}

describe('withoutFrame', () => {
  it('crops a thin frame drawn around a white field, so the field can become transparent', async () => {
    const framed = await png(image(GREY, WHITE))
    const cropped = await withoutFrame(framed)
    expect(await size(cropped)).toEqual([8, 8])

    // Then the whole field clears, and only the mark is left opaque.
    const { data } = await sharp(await removeWhiteBackground(cropped))
      .raw()
      .toBuffer({ resolveWithObject: true })
    const opaque = [...Array(64).keys()].filter((n) => data[n * 4 + 3] > 0)
    expect(opaque).toHaveLength(4)
  })

  it('leaves a logo already on white alone', async () => {
    const plain = await png(image(WHITE, WHITE))
    expect(await withoutFrame(plain)).toBe(plain)
  })

  it('leaves a logo that runs to the edge alone — no white ring inside it', async () => {
    const fullBleed = await png(image(RED, GREY))
    expect(await withoutFrame(fullBleed)).toBe(fullBleed)
  })
})

describe('lightenDarkInk', () => {
  const BLACK: Rgb = [10, 10, 10]
  /** A transparent pixel, then the ink, on one row. */
  const strip = (ink: Rgb[]) =>
    sharp(Buffer.from([0, 0, 0, 0, ...ink.flatMap((c) => [...c, 255])]), {
      raw: { width: 1 + ink.length, height: 1, channels: 4 },
    })
      .png()
      .toBuffer()
  const pixels = async (png: Buffer) => [...(await sharp(png).raw().toBuffer())]

  it('redraws a black-only logo in light ink, keeping its transparency', async () => {
    const out = await pixels(await lightenDarkInk(await strip([BLACK, BLACK])))
    expect(out[3]).toBe(0)
    expect(out.slice(4)).toEqual([232, 234, 240, 255, 232, 234, 240, 255])
  })

  it('redraws only the dark ink of an almost-black logo: its touch of colour stays', async () => {
    const out = await pixels(await lightenDarkInk(await strip([...Array(10).fill(BLACK), RED])))
    expect(out.slice(4, 8)).toEqual([232, 234, 240, 255])
    expect(out.slice(-4)).toEqual([...RED, 255])
  })

  it('keeps a logo that mixes black with colour as it is', async () => {
    const mixed = await strip([BLACK, RED])
    expect(await lightenDarkInk(mixed)).toBe(mixed)
  })
})
