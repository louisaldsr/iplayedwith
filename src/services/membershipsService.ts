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
    return { playerId, clubId: ClubId(row.clubId), season, competition }
  })

  const clubIds = [...new Set(parsed.map((m) => m.clubId))]
  const clubById = new Map((await clubsRepo.findManyByIds(db, clubIds)).map((c) => [c.id, c]))

  for (const clubId of clubIds) {
    const club = clubById.get(clubId)
    if (!club) throw new NotFoundError(`club "${clubId}" not found`)
    if (club.sport !== player.sport) {
      throw new ValidationError(`club "${club.name}" plays ${club.sport}, but player is ${player.sport}`)
    }
  }

  return membershipsRepo.upsertMany(db, parsed)
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
