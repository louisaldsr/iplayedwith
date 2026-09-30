import { readFileSync, writeFileSync, copyFileSync } from 'fs'
import path from 'path'
import { chromium, type Page } from '@playwright/test'
import { SPORTS } from '@/domain/sport'
import en from '@/i18n/en'

/**
 * Renders the app's icons and share image from the SVG sources in `brand/`.
 *
 *   npm run brand:render
 *
 * Two marks: `logo.svg` (IPW tile) from 48 px up, `logo-small.svg` (the link alone) below —
 * the letters stop reading at favicon size. Letters and wordmark are outlined (Archivo 800), so
 * nothing here depends on a font but the share card's tagline, set in the app's system font.
 *
 * Writes into `src/app/`, where Next.js picks each file up by name:
 *   icon.svg               browser tab (modern browsers)
 *   favicon.ico            16 + 32 small mark, 48 full — older browsers, bookmarks
 *   apple-icon.png         180 px full mark, full-bleed: iOS rounds the corners itself
 *   opengraph-image.png    1200 × 630 link preview
 */
const ROOT = path.join(__dirname, '../..')
const brand = (file: string) => readFileSync(path.join(ROOT, 'brand', file), 'utf8')
const out = (file: string) => path.join(ROOT, 'src/app', file)

const ACCENT = '#7c6ef5'

async function render(page: Page, width: number, height: number, body: string, background = 'transparent') {
  await page.setViewportSize({ width, height })
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;background:${background}}svg{display:block}</style>${body}`,
  )
  return page.screenshot({ omitBackground: background === 'transparent', clip: { x: 0, y: 0, width, height } })
}

const sized = (svg: string, size: number) => svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)

/** ICO whose entries are PNGs — valid since Windows Vista, read by every current browser. */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i
    header.writeUInt8(size, e)
    header.writeUInt8(size, e + 1)
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(png.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map((i) => i.png)])
}

function shareCard(logo: string, wordmark: string): string {
  const chips = [en.menu.daily, ...SPORTS.map((s) => en.home.sports[s])]
  return `
    <style>
      .card {
        width: 1200px; height: 630px; box-sizing: border-box; padding: 0 110px;
        display: flex; align-items: center; gap: 72px;
        background-color: #111318;
        background-image: radial-gradient(circle, #232738 1.6px, transparent 1.9px);
        background-size: 28px 28px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .text { display: flex; flex-direction: column; gap: 26px; }
      .wordmark { color: #e8eaf0; width: 600px; }
      .wordmark svg { width: 100%; height: auto; }
      .tagline { margin: 0; color: #8b8fa8; font-size: 34px; line-height: 1.3; }
      .chips { display: flex; gap: 12px; margin-top: 8px; }
      .chip {
        padding: 9px 18px; border-radius: 9999px; font-size: 22px; font-weight: 600;
        color: #e8eaf0; border: 2px solid #272b3d; background: #1a1d27;
      }
      .chip:first-child { color: #ffd66b; border-color: #b0925a; }
    </style>
    <div class="card">
      ${sized(logo, 240)}
      <div class="text">
        <div class="wordmark">${wordmark}</div>
        <p class="tagline">Link two players through<br>the teammates they shared.</p>
        <div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
      </div>
    </div>`
}

async function main() {
  const logo = brand('logo.svg')
  const small = brand('logo-small.svg')
  const wordmark = brand('wordmark.svg')

  const browser = await chromium.launch()
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  try {
    copyFileSync(path.join(ROOT, 'brand/logo-small.svg'), out('icon.svg'))

    const favicon = ico([
      { size: 16, png: await render(page, 16, 16, sized(small, 16)) },
      { size: 32, png: await render(page, 32, 32, sized(small, 32)) },
      { size: 48, png: await render(page, 48, 48, sized(logo, 48)) },
    ])
    writeFileSync(out('favicon.ico'), favicon)

    writeFileSync(out('apple-icon.png'), await render(page, 180, 180, sized(logo, 180), ACCENT))
    writeFileSync(out('opengraph-image.png'), await render(page, 1200, 630, shareCard(logo, wordmark)))
  } finally {
    await browser.close()
  }
  console.log('Wrote icon.svg, favicon.ico, apple-icon.png, opengraph-image.png to src/app/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
