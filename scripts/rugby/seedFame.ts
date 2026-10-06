import fs from 'node:fs'
import path from 'node:path'
import { isAfterLatestSeason, isSeason } from '@/domain/season'
import {
  computeFameScores,
  importFameDetails,
  importMembershipStats,
  type FameRowInput,
  type MembershipStatsInput,
} from '@/services/fameService'
import { ServiceError } from '@/services/errors'
import { getDb } from '../common/env'
import { loadJson } from '../common/json'
import { inputPath, outputPath } from '../common/paths'
import { buildClubMatcher, parseClubsCsv } from './lib/clubsIndex'
import { sourceOf, type SeededMap } from './lib/playerMap'
import { SOURCES } from './lib/sources'

/**
 * Step 4 of the rugby pipeline: reads each player's cached profile and writes the fame inputs a
 * membership import does not — international caps, total and by nation, into
 * `player_fame.details`, and each club-season's starts and minutes onto the memberships
 * `seedMemberships` created (the club performance reads the share of the squad's starts).
 *
 * Games played live on `memberships` (written by `seedMemberships`), where the score reads them.
 *
 * Reads the cache directly instead of going through `fetchWithCache`, so a missing profile is
 * reported rather than silently refetched: this step must never put ~15k requests on
 * allrugby.com, and the profiles are already on disk from `mapPlayers`.
 *
 *
 * No progress file: re-running rewrites the same values, which is the point. This step writes
 * `player_fame.details`, then recomputes every score of the sport.
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
  // The same club matching as seedMemberships: a club-season only reaches a membership the
  // membership import created, and the DB function skips any other.
  const matcher = buildClubMatcher(parseClubsCsv(inputPath('clubs.csv')))
  const rows: FameRowInput[] = []
  const stats: MembershipStatsInput[] = []
  let missingProfiles = 0

  for (const [id, entry] of savedEntries) {
    const source = sourceOf(entry)
    const cachePath = path.join(profilesDir, `${source}-${id}.html`)

    if (!fs.existsSync(cachePath)) {
      missingProfiles++
      continue
    }

    const html = fs.readFileSync(cachePath, 'utf8')
    const career = SOURCES[source].parseCareerStats(html)

    // An uncapped player still gets a row: 0 is a real signal, and leaving them out would keep
    // a stale value from a past run.
    rows.push({ playerId: entry.playerId, caps: career.caps, capsByNation: career.capsByNation })

    // Starts and minutes per club-season, summed over the same lines as `games`. Null where the
    // profile gives no figure — written as such, so a stale value cannot survive.
    const byClubSeason = new Map<string, MembershipStatsInput>()
    for (const season of SOURCES[source].parseSeasonStats(html)) {
      if (!isSeason(season.season) || isAfterLatestSeason(season.season)) continue
      const match = matcher(season.clubName)
      if (match.status !== 'exact' && match.status !== 'fuzzy') continue
      const key = `${match.clubId}||${season.season}`
      const row = byClubSeason.get(key) ?? {
        playerId: entry.playerId,
        clubId: match.clubId,
        season: season.season,
        starts: null,
        minutes: null,
      }
      // Two profile club names can resolve to one club (an alias): their figures add up.
      if (season.starts !== null) row.starts = (row.starts ?? 0) + season.starts
      if (season.minutes !== null) row.minutes = (row.minutes ?? 0) + season.minutes
      byClubSeason.set(key, row)
    }
    stats.push(...byClubSeason.values())
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

  const withStarts = stats.filter((s) => s.starts !== null).length
  console.log(`${stats.length} club-seasons read — starts known for ${withStarts}.`)

  if (dryRun) {
    console.log(`Done (dry run, no DB writes). would write=${rows.length} details, ${stats.length} club-seasons`)
    return
  }

  try {
    const db = getDb()
    const { written } = await importFameDetails(db, 'rugby', rows)
    const { written: statsWritten } = await importMembershipStats(db, 'rugby', stats)
    // Scored right away: the signals just moved, so every stored score is now stale.
    const { scored } = await computeFameScores(db, 'rugby')
    console.log(
      `Done. details written=${written}, club-seasons written=${statsWritten}/${stats.length} ` +
        `(the rest have no membership), scored=${scored}`,
    )
  } catch (err) {
    throw new Error(`Failed to import fame: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
