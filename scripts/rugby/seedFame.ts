import fs from 'node:fs'
import path from 'node:path'
import { importFameDetails, type FameRowInput } from '@/services/fameService'
import { ServiceError } from '@/services/errors'
import { getDb } from '../common/env'
import { loadJson } from '../common/json'
import { inputPath, outputPath } from '../common/paths'
import { sourceOf, type SeededMap } from './lib/playerMap'
import { SOURCES } from './lib/sources'

/**
 * Step 4 of the rugby pipeline: reads international caps off each player's cached profile and
 * writes them as fame signals.
 *
 * Only caps: games played live on `memberships` (written by `seedMemberships`), where the score
 * reads them alongside the seasons they are divided by.
 *
 * Reads the cache directly instead of going through `fetchWithCache`, so a missing profile is
 * reported rather than silently refetched: this step must never put ~15k requests on
 * allrugby.com, and the profiles are already on disk from `mapPlayers`.
 *
 *
 * No progress file: re-running rewrites the same values, which is the point. This step writes
 * `player_fame.details` only; the score is derived from it separately and stays NULL until
 * that runs.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const seededPath = outputPath('players-seeded.json')
  const seeded = loadJson<SeededMap>(seededPath, {})
  const savedEntries = Object.entries(seeded).filter(
    (e): e is [string, SeededMap[string] & { playerId: string }] => e[1].status === 'saved' && !!e[1].playerId,
  )
  if (savedEntries.length === 0) {
    console.error(`No 'saved' players found in ${seededPath} — run seedPlayers.ts first.`)
    process.exit(1)
  }

  const profilesDir = inputPath('players', 'profiles')
  const rows: FameRowInput[] = []
  let missingProfiles = 0

  for (const [id, entry] of savedEntries) {
    const source = sourceOf(entry)
    const cachePath = path.join(profilesDir, `${source}-${id}.html`)

    if (!fs.existsSync(cachePath)) {
      missingProfiles++
      continue
    }

    const html = fs.readFileSync(cachePath, 'utf8')
    const stats = SOURCES[source].parseCareerStats(html)

    // An uncapped player still gets a row: 0 is a real signal, and leaving them out would keep
    // a stale value from a past run.
    rows.push({ playerId: entry.playerId, caps: stats.caps })
  }

  if (missingProfiles > 0) {
    console.warn(
      `${missingProfiles} player(s) skipped: no cached profile in ${profilesDir} — re-run mapPlayers.ts to fetch them.`,
    )
  }

  const withCaps = rows.filter((r) => r.caps > 0).length
  console.log(
    `${rows.length} players read — caps>0 for ${withCaps} ` +
      `(${((100 * withCaps) / Math.max(rows.length, 1)).toFixed(1)}%).`,
  )

  if (dryRun) {
    console.log(`Done (dry run, no DB writes). would write=${rows.length}`)
    return
  }

  try {
    const { written } = await importFameDetails(getDb(), 'rugby', rows)
    console.log(`Done. details written=${written}`)
  } catch (err) {
    throw new Error(`Failed to import fame: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
