import { SupabaseClient } from '@supabase/supabase-js'
import { ImportedFameDetails } from '@/domain/fame'
import { PlayerId } from '@/domain/ids'
import { SportId } from '@/domain/sport'
import * as playersRepo from '@/repositories/playersRepository'
import { ValidationError } from '@/services/errors'

export type FameRowInput = {
  playerId: string
  caps: number
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
 * No score is computed here, and nothing derived from memberships is written: games and
 * seasons are read from `memberships` when the score is computed.
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

export async function listFame(db: SupabaseClient, sport: SportId): Promise<playersRepo.PlayerFame[]> {
  return playersRepo.listFameBySport(db, sport)
}
