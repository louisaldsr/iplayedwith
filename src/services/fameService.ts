import { SupabaseClient } from '@supabase/supabase-js'
import { ImportedExposureDetails, ImportedFameDetails } from '@/domain/fame'
import { ClubId, PlayerId } from '@/domain/ids'
import { isSeason, Season } from '@/domain/season'
import { SportId } from '@/domain/sport'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import * as playersRepo from '@/repositories/playersRepository'
import { ValidationError } from '@/services/errors'

export type FameRowInput = {
  playerId: string
  caps: number
  /** The same caps by national side, as the source labels it. */
  capsByNation?: Record<string, number>
}

/**
 * Counts above this are a parsing bug, not a career.
 *
 * Set well above the most-capped players in any sport (a few hundred at most). The failure it
 * catches is a column shifting by one in a scraped table or a CSV — a minutes-played value
 * landing in `caps` would quietly promote a journeyman to the top of the ranking.
 */
const MAX_PLAUSIBLE_CAPS = 700

/**
 * Writes the fame signals one import produced into `player_fame.details`.
 *
 * Validation runs over every row before the first write, so a bad batch fails the call instead
 * of landing half of itself — the same stance as `upsertMembershipsBulk`.
 *
 * No score is computed here (see `computeFameScores`), and nothing derived from memberships
 * is written: games are read from `memberships` when the score is computed.
 */
export async function importFameDetails(
  db: SupabaseClient,
  sport: SportId,
  rows: FameRowInput[],
): Promise<{ written: number }> {
  const updatedAt = new Date().toISOString()

  const parsed = rows.map((row, i) => {
    if (!row.playerId) throw new ValidationError(`row ${i}: playerId is required`)
    const details: ImportedFameDetails = { caps: checkCaps(row.caps, `row ${i}: caps`), updatedAt }
    if (row.capsByNation !== undefined) {
      const byNation: Record<string, number> = {}
      for (const [nation, caps] of Object.entries(row.capsByNation)) {
        if (!nation.trim()) throw new ValidationError(`row ${i}: empty nation in capsByNation`)
        byNation[nation] = checkCaps(caps, `row ${i}: capsByNation.${nation}`)
      }
      details.capsByNation = byNation
    }
    return { playerId: PlayerId(row.playerId), details }
  })

  const written = await playersRepo.applyFameDetails(db, sport, parsed)
  return { written }
}

function checkCaps(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ValidationError(`${label}: expected a whole number, got ${value}`)
  }
  if (value < 0) throw new ValidationError(`${label}: must not be negative, got ${value}`)
  if (value > MAX_PLAUSIBLE_CAPS) {
    throw new ValidationError(`${label}: ${value} is implausibly high — check the source column`)
  }
  return value
}

/**
 * Recomputes the score of every player of the sport from the signals already stored — caps in
 * `player_fame.details`, games in `memberships`, and the season prestige of the squads they
 * played in, which the same call rescores first. Run after an import, or alone after the
 * formula, a weight or a constant changed.
 */
export async function computeFameScores(db: SupabaseClient, sport: SportId): Promise<{ scored: number }> {
  const scored = await playersRepo.computeFameScores(db, sport)
  return { scored }
}

export async function listFame(db: SupabaseClient, sport: SportId): Promise<playersRepo.PlayerFame[]> {
  return playersRepo.listFameBySport(db, sport)
}

export type MembershipStatsInput = {
  playerId: string
  clubId: string
  season: string
  starts?: number | null
  minutes?: number | null
}

/**
 * Starts in one club-season above this are a parsing bug. A start is a game, so the ceiling is the
 * one `memberships.games` uses (membershipsService): an NBA season runs to 82 games plus four
 * playoff rounds, and 98 basketball club-seasons hold more than 100 starts (Jordan 1991-92: 104).
 */
const MAX_PLAUSIBLE_STARTS = 250
/** Minutes in one club-season above this are a parsing bug (100 games of 120 minutes). */
const MAX_PLAUSIBLE_MINUTES = 12_000

/**
 * Writes starts and minutes onto the sport's existing memberships — the inputs of the club
 * performance (025). Validated whole before the first write, like `importFameDetails`.
 */
export async function importMembershipStats(
  db: SupabaseClient,
  sport: SportId,
  rows: MembershipStatsInput[],
): Promise<{ written: number }> {
  const parsed = rows.map((row, i): membershipsRepo.MembershipStatsRow => {
    const label = `row ${i} (${row.playerId} ${row.clubId} ${row.season})`
    if (!row.playerId || !row.clubId) throw new ValidationError(`${label}: playerId and clubId are required`)
    if (!isSeason(row.season)) throw new ValidationError(`${label}: invalid season "${row.season}"`)
    return {
      playerId: PlayerId(row.playerId),
      clubId: ClubId(row.clubId),
      season: Season(row.season),
      ...(row.starts !== undefined && { starts: checkCount(row.starts, MAX_PLAUSIBLE_STARTS, `${label}: starts`) }),
      ...(row.minutes !== undefined && {
        minutes: checkCount(row.minutes, MAX_PLAUSIBLE_MINUTES, `${label}: minutes`),
      }),
    }
  })
  const written = await membershipsRepo.applyMembershipStats(db, sport, parsed)
  return { written }
}

/**
 * Replaces the nation tiers `source` owns in the sport. A weight is in (0, 1]: a cap for the
 * strongest nations counts fully, never more.
 */
export async function importNationTiers(
  db: SupabaseClient,
  sport: SportId,
  source: string,
  rows: { nation: string; weight: number }[],
): Promise<{ written: number }> {
  if (!source.trim()) throw new ValidationError('source is required')
  const seen = new Set<string>()
  for (const [i, row] of rows.entries()) {
    if (!row.nation.trim()) throw new ValidationError(`row ${i}: nation is required`)
    if (seen.has(row.nation)) throw new ValidationError(`row ${i}: nation "${row.nation}" listed twice`)
    seen.add(row.nation)
    if (!Number.isFinite(row.weight) || row.weight <= 0 || row.weight > 1) {
      throw new ValidationError(`row ${i}: weight must be in (0, 1], got ${row.weight}`)
    }
  }
  const written = await playersRepo.replaceNationTiers(db, sport, source, rows)
  return { written }
}

export type ExposureRowInput = {
  playerId: string
  /** The Wikidata item, or null when no match was found. */
  wikidataId: string | null
  /** How the match was made; null with no match. */
  match: 'id' | 'unique-name' | null
  /** French + English views per year; null when the item has no article in either language. */
  viewsPerYear: number | null
  viewsWindow: string
}

/**
 * Writes the exposure signals of `fame:exposure` into `player_fame.details`. A player with no
 * match is written too, with `wikidataId: null`: a stale match from an earlier run must not
 * survive the one that no longer finds it.
 */
export async function importExposure(
  db: SupabaseClient,
  sport: SportId,
  rows: ExposureRowInput[],
): Promise<{ written: number }> {
  const updatedAt = new Date().toISOString()
  const parsed = rows.map((row, i) => {
    if (!row.playerId) throw new ValidationError(`row ${i}: playerId is required`)
    if (row.wikidataId !== null && !/^Q[1-9]\d*$/.test(row.wikidataId)) {
      throw new ValidationError(`row ${i}: "${row.wikidataId}" is not a Wikidata item id`)
    }
    if (row.viewsPerYear !== null && (!Number.isFinite(row.viewsPerYear) || row.viewsPerYear < 0)) {
      throw new ValidationError(`row ${i}: viewsPerYear must be a non-negative number, got ${row.viewsPerYear}`)
    }
    if (row.wikidataId === null && (row.viewsPerYear !== null || row.match !== null)) {
      throw new ValidationError(`row ${i}: views or a match method without a Wikidata match`)
    }
    if (row.wikidataId !== null && row.match === null) {
      throw new ValidationError(`row ${i}: a Wikidata match needs its method`)
    }
    if (!/^\d{6}-\d{6}$/.test(row.viewsWindow)) {
      throw new ValidationError(`row ${i}: viewsWindow must read YYYYMM-YYYYMM, got "${row.viewsWindow}"`)
    }
    const details: ImportedExposureDetails = {
      wikidataId: row.wikidataId,
      viewsPerYear: row.viewsPerYear,
      viewsWindow: row.viewsWindow,
      wikidataMatch: row.match,
      updatedAt,
    }
    return { playerId: PlayerId(row.playerId), details }
  })
  const written = await playersRepo.applyFameDetails(db, sport, parsed)
  return { written }
}

function checkCount(value: number | null, max: number, label: string): number | null {
  if (value === null) return null
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${label}: expected a non-negative whole number, got ${value}`)
  }
  if (value > max) throw new ValidationError(`${label}: ${value} is implausibly high — check the source column`)
  return value
}
