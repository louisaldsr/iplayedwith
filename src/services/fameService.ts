import { SupabaseClient } from '@supabase/supabase-js'
import { ImportedFameDetails } from '@/domain/fame'
import { PlayerId } from '@/domain/ids'
import { SportId } from '@/domain/sport'
import * as playersRepo from '@/repositories/playersRepository'
import { ValidationError } from '@/services/errors'

export type FameRowInput = {
  playerId: string
  gamesPlayed: number
  caps: number
}

/**
 * Counts above this are a parsing bug, not a career.
 *
 * 700 is set just above the real ceiling: Robert Lewandowski tops the football dataset at 665
 * games, and no rugby profile comes close. The failure this catches is a column shifting by
 * one in a scraped table or a CSV — a minutes-played value landing in `gamesPlayed` would
 * quietly promote a journeyman to the top of the ranking, and the √ curve would hide it by
 * clamping the value back into range.
 */
const MAX_PLAUSIBLE_COUNT = 700

/**
 * Writes the fame signals one import produced, then refreshes the season counts.
 *
 * Validation runs over every row before the first write, so a bad batch fails the call instead
 * of landing half of itself — the same stance as `upsertMembershipsBulk`.
 *
 * There is no recompute step: `players.fame` is a generated column, so both writes below
 * recalculate it in place. That is the whole reason the score is absolute rather than a
 * percentile — a percentile would have needed the entire roster re-ranked after every write.
 */
export async function importFameDetails(
  db: SupabaseClient,
  sport: SportId,
  rows: FameRowInput[],
): Promise<{ written: number; seasonsRefreshed: number }> {
  const updatedAt = new Date().toISOString()

  const parsed = rows.map((row, i) => {
    if (!row.playerId) throw new ValidationError(`row ${i}: playerId is required`)
    const details: ImportedFameDetails = {
      gamesPlayed: checkCount(row.gamesPlayed, `row ${i}: gamesPlayed`),
      caps: checkCount(row.caps, `row ${i}: caps`),
      updatedAt,
    }
    return { playerId: PlayerId(row.playerId), details }
  })

  const written = await playersRepo.applyFameDetails(db, sport, parsed)
  const seasonsRefreshed = await playersRepo.refreshFameSeasons(db, sport)
  return { written, seasonsRefreshed }
}

function checkCount(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ValidationError(`${label}: expected a whole number, got ${value}`)
  }
  if (value < 0) throw new ValidationError(`${label}: must not be negative, got ${value}`)
  if (value > MAX_PLAUSIBLE_COUNT) {
    throw new ValidationError(`${label}: ${value} is implausibly high — check the source column`)
  }
  return value
}

/** Recounts distinct seasons from `memberships` without touching the imported signals. */
export async function refreshFameSeasons(db: SupabaseClient, sport: SportId): Promise<number> {
  return playersRepo.refreshFameSeasons(db, sport)
}

export async function listFame(db: SupabaseClient, sport: SportId): Promise<playersRepo.PlayerFame[]> {
  return playersRepo.listFameBySport(db, sport)
}
