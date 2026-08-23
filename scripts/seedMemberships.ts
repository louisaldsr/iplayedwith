import fs from 'node:fs'
import path from 'node:path'
import { getDb } from './lib/env'
import { parseClubsCsv, buildClubMatcher } from './lib/clubsIndex'
import { parseCareerRows } from './lib/playerProfileParser'
import { fetchWithCache } from './lib/fetchWithCache'
import { upsertMemberships, type MembershipRowInput } from '@/services/membershipsService'
import { ServiceError } from '@/services/errors'

type PlayerMapEntry = { playerId: string; name: string; profileUrl: string }
type PlayerMap = Record<string, PlayerMapEntry>

type ManualReviewRow = {
  playerName: string
  profileUrl: string
  season: string
  clubName: string
  matchStatus: 'none' | 'ambiguous'
  candidates: string
}

type PlayerRejected = {
  allrugbyId: string
  playerId: string
  playerName: string
  profileUrl: string
  unmatchedClubs: { season: string; clubName: string }[]
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function writeManualReviewCsv(csvPath: string, rows: ManualReviewRow[]) {
  const header = 'playerName,profileUrl,season,clubName,matchStatus,candidates'
  const lines = rows.map((r) =>
    [r.playerName, r.profileUrl, r.season, r.clubName, r.matchStatus, r.candidates].map(escapeCsv).join(','),
  )
  fs.mkdirSync(path.dirname(csvPath), { recursive: true })
  fs.writeFileSync(csvPath, [header, ...lines].join('\n') + '\n', 'utf8')
}

async function main() {
  const stem = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  if (!stem) {
    console.error('Usage: tsx scripts/seedMemberships.ts <nationality-stem> [--dry-run]  (e.g. france)')
    process.exit(1)
  }

  const mapPath = path.resolve(__dirname, 'output', `players-map.${stem}.json`)
  if (!fs.existsSync(mapPath)) {
    console.error(`No player map found at ${mapPath} — run seedPlayers.ts "${stem}" first.`)
    process.exit(1)
  }
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8')) as PlayerMap

  const clubsCsvPath = path.resolve(__dirname, 'input/clubs.csv')
  const matcher = buildClubMatcher(parseClubsCsv(clubsCsvPath))

  const profilesDir = path.resolve(__dirname, 'input/players/profiles')
  const manualReviewPath = path.resolve(__dirname, 'output', `manual-review.${stem}.csv`)
  const playersRejectedPath = path.resolve(__dirname, 'output', `players-rejected.${stem}.json`)

  const db = getDb()
  const entries = Object.entries(map)
  const manualReviewRows: ManualReviewRow[] = []
  const playersRejected: PlayerRejected[] = []

  let playersProcessed = 0
  let membershipsUpserted = 0
  let playersFailed = 0

  for (const [allrugbyId, entry] of entries) {
    playersProcessed++
    if (playersProcessed % 100 === 0) {
      console.log(`... ${playersProcessed}/${entries.length} players processed`)
    }

    let html: string
    try {
      html = await fetchWithCache(entry.profileUrl, path.join(profilesDir, `${allrugbyId}.html`))
    } catch (err) {
      playersFailed++
      console.error(`Failed to fetch profile for "${entry.name}" (${allrugbyId}): ${(err as Error).message}`)
      continue
    }

    const careerRows = parseCareerRows(html)
    const rows: MembershipRowInput[] = []
    const unmatchedClubs: { season: string; clubName: string }[] = []

    for (const row of careerRows) {
      const match = matcher(row.clubName)
      if (match.status === 'exact' || match.status === 'fuzzy') {
        rows.push({ clubId: match.clubId, season: row.season, competition: row.competition })
      } else {
        manualReviewRows.push({
          playerName: entry.name,
          profileUrl: entry.profileUrl,
          season: row.season,
          clubName: row.clubName,
          matchStatus: match.status,
          candidates: match.status === 'ambiguous' ? match.candidates.join('; ') : '',
        })
        if (match.status === 'none') {
          unmatchedClubs.push({ season: row.season, clubName: row.clubName })
        }
      }
    }

    if (unmatchedClubs.length > 0) {
      playersRejected.push({
        allrugbyId,
        playerId: entry.playerId,
        playerName: entry.name,
        profileUrl: entry.profileUrl,
        unmatchedClubs,
      })
    }

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
  fs.mkdirSync(path.dirname(playersRejectedPath), { recursive: true })
  fs.writeFileSync(playersRejectedPath, JSON.stringify(playersRejected, null, 2) + '\n', 'utf8')

  console.log(
    `Done${dryRun ? ' (dry run, no DB writes)' : ''}. players=${playersProcessed} ` +
      `memberships=${membershipsUpserted} failed=${playersFailed} manualReview=${manualReviewRows.length} ` +
      `playersRejected=${playersRejected.length}`,
  )
  console.log(`Manual review rows written to ${manualReviewPath}`)
  console.log(`Players rejected (club not found) written to ${playersRejectedPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
