import { SupabaseClient } from '@supabase/supabase-js'
import { ClubId } from '@/domain/ids'
import { ContinentalWins } from '@/domain/prestige'
import { isSeason, Season } from '@/domain/season'
import { SportId } from '@/domain/sport'
import * as prestigeRepo from '@/repositories/prestigeRepository'
import { ValidationError } from '@/services/errors'

export type ContinentalWinsInput = { clubId: string; season: string; wins: ContinentalWins }
export type ClubTitleInput = { clubId: string; season: string; competition: string }

/**
 * A club's wins in one continental competition and one season, above which the count is a
 * parsing bug, not a run. The most measured is 17 (the Crusaders' 2017 Super Rugby season); a
 * column shifting by one — a minutes cell landing in the W/D/L one — would land far beyond.
 */
const MAX_PLAUSIBLE_CONTINENTAL_WINS = 25

/**
 * Replaces the continental runs of the whole sport with `rows`.
 *
 * Validation runs over every row before the write, so a bad batch fails the call instead of
 * landing half of itself — the stance of `importFameDetails`. Two rows for the same club-season
 * are refused: the import is supposed to have merged them, and a silent "last one wins" would
 * hide a club matched twice under two names.
 */
export async function importContinentalWins(
  db: SupabaseClient,
  sport: SportId,
  rows: ContinentalWinsInput[],
): Promise<{ written: number }> {
  const seen = new Set<string>()
  const parsed = rows.map((row, i): prestigeRepo.ContinentalWinsRow => {
    const label = `row ${i} (${row.clubId} ${row.season})`
    const clubId = checkClubId(row.clubId, label)
    const season = checkSeason(row.season, label)
    const key = `${clubId}||${season}`
    if (seen.has(key)) throw new ValidationError(`${label}: club-season listed twice`)
    seen.add(key)

    const wins: ContinentalWins = {}
    for (const [competition, count] of Object.entries(row.wins)) {
      if (!competition.trim()) throw new ValidationError(`${label}: empty competition name`)
      if (!Number.isInteger(count) || count < 0) {
        throw new ValidationError(`${label}: ${competition} wins must be a whole number, got ${count}`)
      }
      if (count > MAX_PLAUSIBLE_CONTINENTAL_WINS) {
        throw new ValidationError(`${label}: ${count} ${competition} wins is implausible — check the source`)
      }
      if (count > 0) wins[competition] = count
    }
    return { clubId, season, wins }
  })

  const written = await prestigeRepo.replaceContinentalWins(db, sport, parsed)
  return { written }
}

/**
 * Replaces every title `source` owns in the sport with `rows`. A competition-season with two
 * winners is refused before anything is written — the table would refuse it anyway, but only
 * after deleting the old titles.
 */
export async function importClubTitles(
  db: SupabaseClient,
  sport: SportId,
  source: string,
  rows: ClubTitleInput[],
): Promise<{ written: number }> {
  if (!source.trim()) throw new ValidationError('source is required')

  // The same title listed twice with the same winner is harmless and kept once.
  const byTitle = new Map<string, prestigeRepo.ClubTitleRow>()
  rows.forEach((row, i) => {
    const label = `row ${i} (${row.competition} ${row.season})`
    const clubId = checkClubId(row.clubId, label)
    const season = checkSeason(row.season, label)
    if (!row.competition.trim()) throw new ValidationError(`${label}: competition is required`)

    const key = `${row.competition}||${season}`
    const winner = byTitle.get(key)?.clubId
    if (winner && winner !== clubId) throw new ValidationError(`${label}: two winners (${winner}, ${clubId})`)
    byTitle.set(key, { clubId, season, competition: row.competition })
  })

  const written = await prestigeRepo.replaceClubTitles(db, sport, source, [...byTitle.values()])
  return { written }
}

export async function listSeasonPrestige(db: SupabaseClient, sport: SportId) {
  return prestigeRepo.listSeasonPrestige(db, sport)
}

export async function listPrestigeCompetitions(db: SupabaseClient, sport: SportId) {
  return prestigeRepo.listPrestigeCompetitions(db, sport)
}

export async function listClubTitles(db: SupabaseClient, sport: SportId) {
  return prestigeRepo.listClubTitles(db, sport)
}

function checkClubId(raw: string, label: string): ClubId {
  if (!raw) throw new ValidationError(`${label}: clubId is required`)
  return ClubId(raw)
}

function checkSeason(raw: string, label: string): Season {
  if (!isSeason(raw)) throw new ValidationError(`${label}: invalid season "${raw}"`)
  return Season(raw)
}
