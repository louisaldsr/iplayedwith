import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../common/env'
import { parseClubsCsv, buildClubMatcher } from './lib/clubsIndex'
import { fetchWithCache } from '../common/fetchWithCache'
import { matchCareer, writeManualReviewCsv, type ManualReviewRow } from './lib/careerMatching'
import { loadJson } from '../common/json'
import { inputPath, outputPath } from '../common/paths'
import { sourceOf, type SeededMap } from './lib/playerMap'
import { SOURCES } from './lib/sources'
import { upsertMemberships, listMembershipsBySport, type MembershipRowInput } from '@/services/membershipsService'
import { ServiceError } from '@/services/errors'

type MembershipConflictRow = {
  playerName: string
  playerId: string
  clubId: string
  season: string
  existingCompetition: string
  newCompetition: string
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function writeConflictsCsv(csvPath: string, rows: MembershipConflictRow[]) {
  const header = 'playerName,playerId,clubId,season,existingCompetition,newCompetition'
  const lines = rows.map((r) =>
    [r.playerName, r.playerId, r.clubId, r.season, r.existingCompetition, r.newCompetition].map(escapeCsv).join(','),
  )
  fs.mkdirSync(path.dirname(csvPath), { recursive: true })
  fs.writeFileSync(csvPath, [header, ...lines].join('\n') + '\n', 'utf8')
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const noCompetitionFilter = process.argv.includes('--no-competition-filter')

  const seededPath = outputPath('players-seeded.json')
  const seeded = loadJson<SeededMap>(seededPath, {})
  const savedEntries = Object.entries(seeded).filter(
    (e): e is [string, SeededMap[string] & { playerId: string }] => e[1].status === 'saved' && !!e[1].playerId,
  )
  if (savedEntries.length === 0) {
    console.error(`No 'saved' players found in ${seededPath} — run seedPlayers.ts first.`)
    process.exit(1)
  }

  const clubsCsvPath = inputPath('clubs.csv')
  const matcher = buildClubMatcher(parseClubsCsv(clubsCsvPath))
  const profilesDir = inputPath('players', 'profiles')
  const manualReviewPath = outputPath('manual-review.csv')
  const conflictsPath = outputPath('manual-review-memberships.csv')

  const db = getDb()
  const manualReviewRows: ManualReviewRow[] = []
  const conflictRows: MembershipConflictRow[] = []

  // Existing (clubId, season) -> competition per player, to detect a new import
  // reporting a different competition label for a triple we already have data for.
  const existingByPlayerId = new Map<string, Map<string, string | undefined>>()
  for (const m of await listMembershipsBySport(db, 'rugby')) {
    const byPair = existingByPlayerId.get(m.playerId) ?? new Map<string, string | undefined>()
    byPair.set(`${m.clubId}||${m.season}`, m.competition)
    existingByPlayerId.set(m.playerId, byPair)
  }

  let playersProcessed = 0
  let membershipsUpserted = 0
  let playersFailed = 0
  let competitionRowsDropped = 0
  let conflictsSkipped = 0

  for (const [id, entry] of savedEntries) {
    playersProcessed++
    if (playersProcessed % 100 === 0) {
      console.log(`... ${playersProcessed}/${savedEntries.length} players processed`)
    }

    const source = sourceOf(entry)
    const adapter = SOURCES[source]

    let html: string
    try {
      // Already cached by mapPlayers.ts — this only hits the network if the file is missing.
      html = await fetchWithCache(entry.profileUrl, path.join(profilesDir, `${source}-${id}.html`))
    } catch (err) {
      playersFailed++
      console.error(`Failed to read profile for "${entry.name}" (${id}): ${(err as Error).message}`)
      continue
    }

    const careerRows = adapter.parseCareerRows(html)
    const {
      rows,
      manualReviewRows: newManualReviewRows,
      droppedCount,
    } = matchCareer(entry.name, entry.profileUrl, careerRows, matcher, { applyCompetitionFilter: !noCompetitionFilter })
    manualReviewRows.push(...newManualReviewRows)
    competitionRowsDropped += droppedCount

    const existingPairs = existingByPlayerId.get(entry.playerId)
    const rowsToUpsert: MembershipRowInput[] = []
    for (const row of rows) {
      const existingCompetition = existingPairs?.get(`${row.clubId}||${row.season}`)
      if (existingCompetition && row.competition && existingCompetition !== row.competition) {
        conflictsSkipped++
        conflictRows.push({
          playerName: entry.name,
          playerId: entry.playerId,
          clubId: row.clubId,
          season: row.season,
          existingCompetition,
          newCompetition: row.competition,
        })
        continue
      }
      rowsToUpsert.push(row)
    }

    if (rowsToUpsert.length === 0) continue

    if (dryRun) {
      membershipsUpserted += rowsToUpsert.length
      continue
    }

    try {
      await upsertMemberships(db, entry.playerId, rowsToUpsert)
      membershipsUpserted += rowsToUpsert.length
    } catch (err) {
      playersFailed++
      const message = err instanceof ServiceError ? err.message : String(err)
      console.error(`Failed to upsert memberships for "${entry.name}" (${id}): ${message}`)
    }
  }

  writeManualReviewCsv(manualReviewPath, manualReviewRows)
  writeConflictsCsv(conflictsPath, conflictRows)

  console.log(
    `Done${dryRun ? ' (dry run, no DB writes)' : ''}. players=${playersProcessed} ` +
      `memberships=${membershipsUpserted} failed=${playersFailed} manualReview=${manualReviewRows.length} ` +
      `competitionRowsDropped=${competitionRowsDropped} conflictsSkipped=${conflictsSkipped}`,
  )
  console.log(`Manual review rows written to ${manualReviewPath}`)
  console.log(`Membership conflicts written to ${conflictsPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
