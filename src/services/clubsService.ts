import { randomUUID } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import * as clubsRepo from '@/repositories/clubsRepository'
import { ClubId } from '@/domain/ids'
import { Club, ClubSearchResult } from '@/domain/club'
import { SportId } from '@/domain/sport'
import { ConflictError, NotFoundError } from '@/services/errors'

export async function listClubs(
  db: SupabaseClient,
  sport: SportId,
  q?: string,
): Promise<ClubSearchResult[]> {
  return q ? clubsRepo.searchBySport(db, sport, q) : clubsRepo.listBySport(db, sport)
}

export async function getClub(db: SupabaseClient, id: string): Promise<Club> {
  const club = await clubsRepo.findById(db, ClubId(id))
  if (!club) throw new NotFoundError(`club "${id}" not found`)
  return club
}

/** Exact name lookup within a sport, ignoring case, accents and punctuation — the reconciliation path for a seed import that has to re-attach to a club it already created. */
export async function findClubByName(db: SupabaseClient, name: string, sport: SportId): Promise<Club | null> {
  return clubsRepo.findByNameAndSport(db, name, sport)
}

/** Rejects duplicate names within a sport, comparing on the normalized form. */
export async function createClub(
  db: SupabaseClient,
  input: { name: string; sport: SportId; logoUrl?: string | null },
): Promise<Club> {
  const existing = await clubsRepo.findByNameAndSport(db, input.name, input.sport)
  if (existing) throw new ConflictError(`A club named "${input.name}" already exists for ${input.sport}`)

  const club: Club = {
    id: ClubId(randomUUID()),
    name: input.name,
    sport: input.sport,
    logoUrl: input.logoUrl ?? undefined,
  }
  return clubsRepo.insert(db, club)
}
