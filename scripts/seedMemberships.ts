import path from 'node:path'
import { getDb } from './lib/env'
import { parseClubsCsv, buildClubMatcher } from './lib/clubsIndex'
import { parseCareerRows } from './lib/playerProfileParser'
import { fetchWithCache } from './lib/fetchWithCache'
import { matchCareer, writeManualReviewCsv, type ManualReviewRow } from './lib/careerMatching'
import { loadJson, type SeededMap } from './lib/playerMap'
import { upsertMemberships } from '@/services/membershipsService'
import { ServiceError } from '@/services/errors'

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const seededPath = path.resolve(__dirname, 'output', 'players-seeded.json')
  const seeded = loadJson<SeededMap>(seededPath, {})
  const savedEntries = Object.entries(seeded).filter(
    (e): e is [string, SeededMap[string] & { playerId: string }] => e[1].status === 'saved' && !!e[1].playerId,
  )
  if (savedEntries.length === 0) {
    console.error(`No 'saved' players found in ${seededPath} — run seedPlayers.ts first.`)
    process.exit(1)
  }

  const clubsCsvPath = path.resolve(__dirname, 'input/clubs.csv')
  const matcher = buildClubMatcher(parseClubsCsv(clubsCsvPath))
  const profilesDir = path.resolve(__dirname, 'input/players/profiles')
  const manualReviewPath = path.resolve(__dirname, 'output', 'manual-review.csv')

  const db = getDb()
  const manualReviewRows: ManualReviewRow[] = []

  let playersProcessed = 0
  let membershipsUpserted = 0
  let playersFailed = 0
  let competitionRowsDropped = 0

  for (const [allrugbyId, entry] of savedEntries) {
    playersProcessed++
    if (playersProcessed % 100 === 0) {
      console.log(`... ${playersProcessed}/${savedEntries.length} players processed`)
    }

    let html: string
    try {
      // Already cached by mapPlayers.ts — this only hits the network if the file is missing.
      html = await fetchWithCache(entry.profileUrl, path.join(profilesDir, `${allrugbyId}.html`))
    } catch (err) {
      playersFailed++
      console.error(`Failed to read profile for "${entry.name}" (${allrugbyId}): ${(err as Error).message}`)
      continue
    }

    const careerRows = parseCareerRows(html)
    const { rows, manualReviewRows: newManualReviewRows, droppedCount } = matchCareer(
      entry.name,
      entry.profileUrl,
      careerRows,
      matcher,
    )
    manualReviewRows.push(...newManualReviewRows)
    competitionRowsDropped += droppedCount

    if (rows.length === 0) continue

    if (dryRun) {
      membershipsUpserted += rows.length
      continue
    }

    try {
      await upsertMemberships(db, entry.playerId, rows)
      membershipsUpserted += rows.length
    } catch (err) {
      playersFailed++
      const message = err instanceof ServiceError ? err.message : String(err)
      console.error(`Failed to upsert memberships for "${entry.name}" (${allrugbyId}): ${message}`)
    }
  }

  writeManualReviewCsv(manualReviewPath, manualReviewRows)

  console.log(
    `Done${dryRun ? ' (dry run, no DB writes)' : ''}. players=${playersProcessed} ` +
      `memberships=${membershipsUpserted} failed=${playersFailed} manualReview=${manualReviewRows.length} ` +
      `competitionRowsDropped=${competitionRowsDropped}`,
  )
  console.log(`Manual review rows written to ${manualReviewPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
