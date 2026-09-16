import { SupabaseClient } from '@supabase/supabase-js'
import * as playersRepo from '@/repositories/playersRepository'
import * as clubsRepo from '@/repositories/clubsRepository'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import { ClubId, PlayerId } from '@/domain/ids'
import { Season } from '@/domain/season'
import { SportId } from '@/domain/sport'
import { Membership } from '@/domain/membership'
import { NotFoundError, ValidationError } from '@/services/errors'

export type MembershipRowInput = { clubId: string; season: string; competition?: string }

/**
 * Validates each season and that every referenced club plays the same sport as the player,
 * then upserts (re-submitting an already-saved season is a no-op, not an error).
 */
export async function upsertMemberships(
  db: SupabaseClient,
  rawPlayerId: string,
  rows: MembershipRowInput[],
): Promise<Membership[]> {
  const playerId = PlayerId(rawPlayerId)
  const player = await playersRepo.findById(db, playerId)
  if (!player) throw new NotFoundError(`player "${rawPlayerId}" not found`)

  const parsed = rows.map((row, i) => {
    if (!row.clubId) throw new ValidationError(`row ${i}: clubId is required`)
    let season: Season
    try {
      season = Season(row.season)
    } catch (err) {
      throw new ValidationError(`row ${i}: ${(err as Error).message}`)
    }
    const competition = row.competition?.trim() || undefined
    return { playerId, clubId: ClubId(row.clubId), season, sport: player.sport, competition }
  })

  const clubIds = [...new Set(parsed.map((m) => m.clubId))]
  const clubById = new Map((await clubsRepo.findManyByIds(db, clubIds)).map((c) => [c.id, c]))

  // Since 006_sport_space.sql the composite FKs make a cross-sport membership impossible
  // to insert. Kept so the admin UI gets this message instead of a raw FK violation.
  for (const clubId of clubIds) {
    const club = clubById.get(clubId)
    if (!club) throw new NotFoundError(`club "${clubId}" not found`)
    if (club.sport !== player.sport) {
      throw new ValidationError(`club "${club.name}" plays ${club.sport}, but player is ${player.sport}`)
    }
  }

  return membershipsRepo.upsertMany(db, parsed)
}

export type BulkMembershipRowInput = MembershipRowInput & { playerId: string }

/** Rows per upsert request — a seed import writes tens of thousands at once. */
const UPSERT_CHUNK_SIZE = 500

/**
 * Bulk counterpart to `upsertMemberships`, for seed imports.
 *
 * It enforces the same invariants — every season parses, and every referenced player and
 * club exists and plays `sport` — but resolves them against one snapshot of the sport's
 * players and clubs instead of two DB round-trips per player. Validation runs over all
 * rows before the first write, so a bad row fails the call rather than landing a partial
 * batch. Chunks are then sent in order; a mid-run failure leaves earlier chunks
 * committed, and re-running is safe because the writes are upserts.
 */
export async function upsertMembershipsBulk(
  db: SupabaseClient,
  sport: SportId,
  rows: BulkMembershipRowInput[],
): Promise<number> {
  const [clubs, players] = await Promise.all([clubsRepo.listBySport(db, sport), playersRepo.listBySport(db, sport)])
  const clubIds = new Set<string>(clubs.map((c) => c.id))
  const playerIds = new Set<string>(players.map((p) => p.id))

  const parsed = rows.map((row, i) => {
    if (!row.playerId) throw new ValidationError(`row ${i}: playerId is required`)
    if (!row.clubId) throw new ValidationError(`row ${i}: clubId is required`)
    if (!playerIds.has(row.playerId)) {
      throw new NotFoundError(`row ${i}: player "${row.playerId}" not found for ${sport}`)
    }
    if (!clubIds.has(row.clubId)) {
      throw new NotFoundError(`row ${i}: club "${row.clubId}" not found for ${sport}`)
    }

    let season: Season
    try {
      season = Season(row.season)
    } catch (err) {
      throw new ValidationError(`row ${i}: ${(err as Error).message}`)
    }

    return {
      playerId: PlayerId(row.playerId),
      clubId: ClubId(row.clubId),
      season,
      sport,
      competition: row.competition?.trim() || undefined,
    }
  })

  let written = 0
  for (let i = 0; i < parsed.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = parsed.slice(i, i + UPSERT_CHUNK_SIZE)
    await membershipsRepo.upsertMany(db, chunk)
    written += chunk.length
  }
  return written
}

export async function deleteMembership(
  db: SupabaseClient,
  playerId: string,
  clubId: string,
  season: string,
): Promise<void> {
  await membershipsRepo.deleteOne(db, PlayerId(playerId), ClubId(clubId), season as Season)
}

export async function listMembershipsBySport(db: SupabaseClient, sport: SportId): Promise<Membership[]> {
  return membershipsRepo.listBySport(db, sport)
}

/**
 * Seasons a club has a roster for, most recent first.
 *
 * The game's hard mode used to derive this by filtering the full in-memory membership
 * list; this is the server-side replacement. Distinct from `listClubSeasons`, which also
 * counts squad sizes for the admin UI.
 */
export async function listSeasonsForClub(db: SupabaseClient, clubId: string): Promise<Season[]> {
  return membershipsRepo.listSeasonsByClub(db, ClubId(clubId))
}

/** Distinct seasons already entered for a club, most recent first, with squad size. */
export async function listClubSeasons(
  db: SupabaseClient,
  clubId: string,
): Promise<{ season: Season; playerCount: number }[]> {
  const rows = await membershipsRepo.listByClub(db, ClubId(clubId))

  const countBySeason = new Map<Season, number>()
  for (const row of rows) {
    countBySeason.set(row.season, (countBySeason.get(row.season) ?? 0) + 1)
  }

  return [...countBySeason.entries()]
    .map(([season, playerCount]) => ({ season, playerCount }))
    .sort((a, b) => b.season.localeCompare(a.season))
}

/** A club's roster for one season. */
export async function listRoster(
  db: SupabaseClient,
  clubId: string,
  rawSeason: string,
): Promise<{ playerId: PlayerId; playerName: string }[]> {
  const season = Season(rawSeason)
  return membershipsRepo.listByClubAndSeason(db, ClubId(clubId), season)
}
