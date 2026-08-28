import fs from 'node:fs'
import path from 'node:path'
import type { MembershipRowInput } from '@/services/membershipsService'
import type { ClubMatcher } from './clubsIndex'
import type { CareerRow } from './playerProfileParser'
import { isDroppedCompetition, resolveCompetition, isUnmappedEuropeanCompetition } from './competitionMapping'

export type ManualReviewRow = {
  playerName: string
  profileUrl: string
  season: string
  clubName: string
  matchStatus: 'none' | 'ambiguous' | 'unmapped-competition'
  candidates: string
  competition: string
}

export type CareerMatchResult = {
  rows: MembershipRowInput[]
  manualReviewRows: ManualReviewRow[]
  unmatchedClubs: { season: string; clubName: string }[]
  droppedCount: number
}

/**
 * Matches each career row's club name against `matcher`. Pure (no DB call) so a
 * caller can still keep the manual-review/unmatched-club results even if the
 * subsequent `upsertMemberships` call fails.
 *
 * Rows whose competition is dropped (see `competitionMapping`) are skipped entirely —
 * before club matching, so they don't add noise to manual review either. Rows whose
 * competition is a pan-European one get rewritten to the club's domestic league.
 */
export function matchCareer(
  playerName: string,
  profileUrl: string,
  careerRows: CareerRow[],
  matcher: ClubMatcher,
): CareerMatchResult {
  const rows: MembershipRowInput[] = []
  const manualReviewRows: ManualReviewRow[] = []
  const unmatchedClubs: { season: string; clubName: string }[] = []
  let droppedCount = 0

  for (const row of careerRows) {
    if (isDroppedCompetition(row.competition)) {
      droppedCount++
      continue
    }

    const match = matcher(row.clubName)
    if (match.status === 'exact' || match.status === 'fuzzy') {
      rows.push({
        clubId: match.clubId,
        season: row.season,
        competition: resolveCompetition(match.clubId, row.competition),
      })
      if (isUnmappedEuropeanCompetition(match.clubId, row.competition)) {
        // Still created above with the original (unrewritten) competition name — a real
        // club+season is worth having even with an imprecise label — but flagged here so
        // gaps in DOMESTIC_LEAGUE_BY_CLUB_ID are visible instead of silently swallowed.
        manualReviewRows.push({
          playerName,
          profileUrl,
          season: row.season,
          clubName: match.clubName,
          matchStatus: 'unmapped-competition',
          candidates: '',
          competition: row.competition,
        })
      }
    } else {
      manualReviewRows.push({
        playerName,
        profileUrl,
        season: row.season,
        clubName: row.clubName,
        matchStatus: match.status,
        candidates: match.status === 'ambiguous' ? match.candidates.join('; ') : '',
        competition: '',
      })
      if (match.status === 'none') unmatchedClubs.push({ season: row.season, clubName: row.clubName })
    }
  }

  return { rows, manualReviewRows, unmatchedClubs, droppedCount }
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function writeManualReviewCsv(csvPath: string, rows: ManualReviewRow[]) {
  const header = 'playerName,profileUrl,season,clubName,matchStatus,candidates,competition'
  const lines = rows.map((r) =>
    [r.playerName, r.profileUrl, r.season, r.clubName, r.matchStatus, r.candidates, r.competition]
      .map(escapeCsv)
      .join(','),
  )
  fs.mkdirSync(path.dirname(csvPath), { recursive: true })
  fs.writeFileSync(csvPath, [header, ...lines].join('\n') + '\n', 'utf8')
}
