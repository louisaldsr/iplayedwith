import fs from 'node:fs'
import path from 'node:path'
import { isAfterLatestSeason, isSeason } from '@/domain/season'
import { computeFameScores } from '@/services/fameService'
import { importContinentalWins } from '@/services/prestigeService'
import { ServiceError } from '@/services/errors'
import { getDb } from '../common/env'
import { loadJson } from '../common/json'
import { inputPath, outputPath } from '../common/paths'
import { buildClubMatcher, parseClubsCsv } from './lib/clubsIndex'
import { sourceOf, type SeededMap } from './lib/playerMap'
import { createSquadRunCollector, type ResolvedCompetitionRow } from './lib/prestige'
import { SOURCES } from './lib/sources'

/**
 * Step 5 of the rugby pipeline: rebuilds each club-season's continental run — its wins in the
 * Champions Cup, Challenge Cup and Super Rugby — from the cached profiles, then recomputes the sport — season
 * prestige, then fame, which reads it.
 *
 * Titles are not here: rugby titles are curated (supabase/migrations/019_seed_rugby_titles.sql).
 *
 * Reads the profile cache directly, like `seedFame`: a missing profile is reported, never
 * fetched, so this step cannot put ~15k requests on allrugby.com. Run it from the checkout that
 * holds the cache. Runs after `seed:memberships`: the DB keeps only the club-seasons the graph has.
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

  const matcher = buildClubMatcher(parseClubsCsv(inputPath('clubs.csv')))
  const profilesDir = inputPath('players', 'profiles')
  const collector = createSquadRunCollector()
  let missingProfiles = 0
  let unmatchedLines = 0

  for (const [id, entry] of savedEntries) {
    const source = sourceOf(entry)
    const cachePath = path.join(profilesDir, `${source}-${id}.html`)
    if (!fs.existsSync(cachePath)) {
      missingProfiles++
      continue
    }

    const rows: ResolvedCompetitionRow[] = []
    for (const row of SOURCES[source].parseCompetitionRows(fs.readFileSync(cachePath, 'utf8'))) {
      if (!isSeason(row.season) || isAfterLatestSeason(row.season)) continue
      const match = matcher(row.clubName)
      if (match.status !== 'exact' && match.status !== 'fuzzy') {
        unmatchedLines++
        continue
      }
      rows.push({ clubId: match.clubId, season: row.season, competition: row.competition, wins: row.wins })
    }
    collector.addPlayer(rows)
  }

  if (missingProfiles > 0) {
    console.warn(`${missingProfiles} player(s) skipped: no cached profile in ${profilesDir}.`)
  }
  // Same club names seedMemberships already failed to match: listed in manual-review.csv.
  console.log(`${unmatchedLines} competition line(s) on a club that does not resolve — skipped.`)

  const runs = collector.runs()
  const byCompetition = new Map<string, number>()
  for (const run of runs) {
    for (const competition of Object.keys(run.wins)) {
      byCompetition.set(competition, (byCompetition.get(competition) ?? 0) + 1)
    }
  }
  console.log(
    `${runs.length} club-seasons with a continental run: ` + [...byCompetition].map(([c, n]) => `${c} ${n}`).join(', '),
  )

  if (dryRun) {
    console.log('Done (dry run, no DB writes).')
    return
  }

  try {
    const db = getDb()
    const { written } = await importContinentalWins(db, 'rugby', runs)
    // Scored right away: the signals just moved. compute_fame_scores rescores prestige first.
    const { scored } = await computeFameScores(db, 'rugby')
    console.log(`Done. runs written=${written}/${runs.length} (the rest have no membership), players scored=${scored}`)
  } catch (err) {
    throw new Error(`Failed to import prestige: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
