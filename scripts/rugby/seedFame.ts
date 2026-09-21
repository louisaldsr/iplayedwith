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
 * Step 4 of the rugby pipeline: reads matches played and international caps off each player's
 * cached profile, writes them as fame signals, then refreshes the season counts.
 *
 * Reads the cache directly instead of going through `fetchWithCache`, so a missing profile is
 * reported rather than silently refetched: this step must never put ~15k requests on
 * allrugby.com, and the profiles are already on disk from `mapPlayers`.
 *
 * Run it AFTER `seedMemberships` — the season refresh reads the memberships table, so running
 * it on an empty one leaves everyone at `seasons: 0` and drops the intensity term of the score.
 *
 * No progress file: re-running rewrites the same values, which is the point. `players.fame` is
 * a generated column, so it follows each write with no recompute step.
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
  let noStats = 0

  for (const [id, entry] of savedEntries) {
    const source = sourceOf(entry)
    const cachePath = path.join(profilesDir, `${source}-${id}.html`)

    if (!fs.existsSync(cachePath)) {
      missingProfiles++
      continue
    }

    const html = fs.readFileSync(cachePath, 'utf8')
    const stats = SOURCES[source].parseCareerStats(html)

    // A player whose table has no match counts at all still gets a row: 0 is a real signal
    // (bottom of the ranking), and leaving them out would keep a stale score from a past run.
    if (stats.games === 0 && stats.caps === 0) noStats++

    rows.push({ playerId: entry.playerId, gamesPlayed: stats.games, caps: stats.caps })
  }

  if (missingProfiles > 0) {
    console.warn(
      `${missingProfiles} player(s) skipped: no cached profile in ${profilesDir} — re-run mapPlayers.ts to fetch them.`,
    )
  }

  const withCaps = rows.filter((r) => r.caps > 0).length
  console.log(
    `${rows.length} players read — games>0 for ${rows.length - noStats}, caps>0 for ${withCaps} ` +
      `(${((100 * withCaps) / Math.max(rows.length, 1)).toFixed(1)}%), no signal at all for ${noStats}.`,
  )

  if (dryRun) {
    console.log(`Done (dry run, no DB writes). would write=${rows.length}`)
    return
  }

  try {
    const { written, seasonsRefreshed } = await importFameDetails(getDb(), 'rugby', rows)
    console.log(`Done. details written=${written}, season counts refreshed=${seasonsRefreshed}`)
  } catch (err) {
    throw new Error(`Failed to import fame: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
