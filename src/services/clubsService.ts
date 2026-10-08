import { randomUUID } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import * as clubsRepo from '@/repositories/clubsRepository'
import { ClubId } from '@/domain/ids'
import { Club, ClubSearchResult } from '@/domain/club'
import { SportId } from '@/domain/sport'
import { ConflictError, NotFoundError, ValidationError } from '@/services/errors'

export async function listClubs(db: SupabaseClient, sport: SportId, q?: string): Promise<ClubSearchResult[]> {
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

/**
 * Replaces club crests in bulk, for a seed import — clubs are otherwise only ever created. One
 * request per club: an import has a few dozen. Returns how many clubs matched.
 */
export async function updateClubLogos(
  db: SupabaseClient,
  sport: SportId,
  rows: { clubId: string; logoUrl: string }[],
): Promise<{ updated: number }> {
  let updated = 0
  for (const row of rows) {
    if (!row.logoUrl.trim()) throw new ValidationError(`club ${row.clubId}: empty logo URL`)
    if (await clubsRepo.updateLogoUrl(db, sport, ClubId(row.clubId), row.logoUrl)) updated++
  }
  return { updated }
}
