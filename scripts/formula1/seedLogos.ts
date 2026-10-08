import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { updateClubLogos } from '@/services/clubsService'
import { ServiceError } from '@/services/errors'
import { getDb } from '../common/env'
import { fetchBinaryWithCache } from '../common/fetchWithCache'
import { lightenDarkInk, removeWhiteBackground, withoutFrame } from '../common/lib/logos'
import { itemsByEnwikiTitle, leadWikitexts, logoClaims, thumbnailUrls, USER_AGENT } from '../common/lib/wikimedia'
import { inputPath } from '../common/paths'
import { loadSeededIds, seededIdPaths } from '../common/seedDataset'
import { isDrawnLogo, isLogo, logoFileName, logoFileOf, publicLogoUrl } from './lib/logos'
import { loadFormula1Dataset } from './lib/seed'

const PUBLIC_DIR = path.resolve(__dirname, '../../public/logos/formula1')
/** The width Wikimedia renders each logo at — an SVG comes back as a PNG. */
const RENDER_WIDTH = 256
/**
 * The box the served logo fits in. `ClubLogo` shows it at the text's size (~26 px), so 128 px is
 * sharp on a 3× screen — and keeps each file a few kilobytes, not the 250 KB of a photographed badge.
 */
const SERVED_SIZE = 128
const DELAY_MS = 500

/**
 * Step 8 of the Formula 1 pipeline: each constructor's logo (lib/logos.ts says where it is found),
 * with any frame and white background removed, black-only ink made light for the dark theme
 * (scripts/common/lib/logos.ts), and its empty margins trimmed — written to
 * `public/logos/formula1/` and set as the club's `logo_url`. Constructors sharing an article —
 * the 1960s "Lotus-Climax" and "Lotus-BRM" are both Team Lotus — share its logo.
 *
 * The originals are cached in `scripts/input/formula1/logos/`; the cleaned files are committed,
 * so the app serves them itself. Re-running rewrites the same files and the same URLs.
 *
 * Run it once the files are deployed: before, `logo_url` points at a file the site does not have
 * yet (`ClubLogo` then shows its empty slot, nothing breaks).
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadFormula1Dataset()
  const clubIds = loadSeededIds(seededIdPaths('formula1').clubs)
  const titles = [...new Set(dataset.clubs.flatMap((c) => (c.enwikiTitle ? [c.enwikiTitle] : [])))]

  // The article's infobox first, then Wikidata's drawn logo.
  const files = new Map<string, string>()
  for (const [title, text] of await leadWikitexts(titles)) {
    const file = logoFileOf(text)
    if (file && isLogo(file)) files.set(title, file)
  }
  const items = await itemsByEnwikiTitle(titles.filter((t) => !files.has(t)))
  const claims = await logoClaims([...new Set([...items.values()].map((q) => q[0]))])
  let fromWikidata = 0
  for (const [title, qids] of items) {
    const file = claims.get(qids[0])
    if (file && isDrawnLogo(file)) {
      files.set(title, file)
      fromWikidata++
    }
  }
  console.log(`${titles.length} articles: ${files.size} logos (${fromWikidata} from Wikidata).`)

  const renders = await thumbnailUrls([...new Set(files.values())], RENDER_WIDTH)
  fs.mkdirSync(PUBLIC_DIR, { recursive: true })
  const served = new Map<string, string>() // article title → public URL
  for (const [title, file] of files) {
    const url = renders.get(file)
    if (!url) {
      console.warn(`  ${title}: "${file}" has no rendering`)
      continue
    }
    const name = logoFileName(title)
    const extension = path.extname(new URL(url).pathname).toLowerCase() || '.png'
    const original = await fetchBinaryWithCache(
      url,
      inputPath('formula1', 'logos', name.replace(/\.png$/, extension)),
      {
        delayMs: DELAY_MS,
        userAgent: USER_AGENT,
      },
    )
    const clean = await lightenDarkInk(await removeWhiteBackground(await withoutFrame(original)))
    fs.writeFileSync(path.join(PUBLIC_DIR, name), await fitted(clean))
    served.set(title, publicLogoUrl(name))
  }

  const rows: { clubId: string; logoUrl: string }[] = []
  const without: string[] = []
  for (const club of dataset.clubs) {
    const logoUrl = club.enwikiTitle ? served.get(club.enwikiTitle) : undefined
    if (!logoUrl) without.push(club.name)
    else if (clubIds[club.sourceId]) rows.push({ clubId: clubIds[club.sourceId], logoUrl })
  }
  console.log(
    `${served.size} logos written to ${PUBLIC_DIR}; ${rows.length}/${dataset.clubs.length} constructors get one.`,
  )
  console.log(`Without a logo (${without.length}): ${without.sort().join(', ')}`)

  if (dryRun) {
    console.log('Done (dry run, no DB writes).')
    return
  }
  try {
    const { updated } = await updateClubLogos(getDb(), 'formula1', rows)
    console.log(`Done. constructors updated=${updated}/${rows.length}`)
  } catch (err) {
    throw new Error(`Failed to update logos: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

/**
 * The logo without its transparent margins — Wikipedia's renders often pad a wordmark, which
 * `ClubLogo` would then show smaller than the others — scaled into `SERVED_SIZE`.
 */
async function fitted(png: Buffer): Promise<Buffer> {
  let trimmed = png
  try {
    trimmed = await sharp(png)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
      .toBuffer()
  } catch {
    // Nothing left to trim to: keep the margins.
  }
  return sharp(trimmed)
    .resize(SERVED_SIZE, SERVED_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
