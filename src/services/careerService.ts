import { SupabaseClient } from '@supabase/supabase-js'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import * as playersRepo from '@/repositories/playersRepository'
import * as clubsRepo from '@/repositories/clubsRepository'
import { PlayerId } from '@/domain/ids'
import { Player } from '@/domain/player'
import { CareerStint, toCareerStints } from '@/domain/career'
import { NotFoundError } from '@/services/errors'

export type PlayerCareer = { player: Player; stints: CareerStint[] }

/**
 * A player's career, club by club — so a user who has never heard of a player can still see
 * where he played. Three bounded reads: the player, his memberships (a few dozen rows), and the
 * clubs they name.
 */
export async function getPlayerCareer(db: SupabaseClient, playerId: PlayerId): Promise<PlayerCareer> {
  const player = await playersRepo.findById(db, playerId)
  if (!player) throw new NotFoundError(`player "${playerId}" not found`)

  const rows = await membershipsRepo.listCareerRows(db, playerId)
  const clubs = await clubsRepo.findManyByIds(db, [...new Set(rows.map((r) => r.clubId))])
  const clubById = new Map(clubs.map((c) => [c.id, c]))

  // A membership whose club is gone is skipped rather than failing the whole career.
  const known = rows.flatMap((r) => {
    const club = clubById.get(r.clubId)
    return club ? [{ club, season: r.season, games: r.games }] : []
  })

  return { player, stints: toCareerStints(known) }
}
