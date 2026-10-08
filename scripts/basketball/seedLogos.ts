import fs from 'node:fs'
import path from 'node:path'
import { updateClubLogos } from '@/services/clubsService'
import { ServiceError } from '@/services/errors'
import { getDb } from '../common/env'
import { fetchBinaryWithCache } from '../common/fetchWithCache'
import { inputPath } from '../common/paths'
import { loadSeededIds, seededIdPaths } from '../common/seedDataset'
import { removeWhiteBackground } from '../common/lib/logos'
import { logoFileName, publicLogoUrl } from './lib/logos'
import { loadBasketballDataset } from './lib/seed'

const PUBLIC_DIR = path.resolve(__dirname, '../../public/logos/basketball')
const DELAY_MS = 1000

/**
 * Step 8 of the basketball pipeline: each club's crest, with its white background removed
 * (lib/logos.ts), written to `public/logos/basketball/` and set as the club's `logo_url`.
 *
 * The originals are cached in `scripts/input/basketball/logos/`; the cleaned files are committed,
 * so the app serves them itself. Re-running rewrites the same files and the same URLs.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadBasketballDataset()
  const clubIds = loadSeededIds(seededIdPaths('basketball').clubs)
  fs.mkdirSync(PUBLIC_DIR, { recursive: true })

  const rows: { clubId: string; logoUrl: string }[] = []
  for (const club of dataset.clubs) {
    if (!club.logoUrl) {
      console.warn(`  ${club.name}: no logo in the dataset`)
      continue
    }
    const fileName = logoFileName(club.logoUrl)
    const original = await fetchBinaryWithCache(club.logoUrl, inputPath('basketball', 'logos', fileName), {
      delayMs: DELAY_MS,
    })
    fs.writeFileSync(path.join(PUBLIC_DIR, fileName), await removeWhiteBackground(original))
    if (clubIds[club.sourceId]) rows.push({ clubId: clubIds[club.sourceId], logoUrl: publicLogoUrl(fileName) })
  }
  console.log(`${dataset.clubs.length} clubs, ${rows.length} seeded crests written to ${PUBLIC_DIR}`)

  if (dryRun) {
    console.log('Done (dry run, no DB writes).')
    return
  }
  try {
    const { updated } = await updateClubLogos(getDb(), 'basketball', rows)
    console.log(`Done. clubs updated=${updated}/${rows.length}`)
  } catch (err) {
    throw new Error(`Failed to update logos: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
