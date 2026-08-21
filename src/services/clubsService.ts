import { randomUUID } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import * as clubsRepo from '@/repositories/clubsRepository'
import { ClubId } from '@/domain/ids'
import { Club } from '@/domain/club'
import { SportId } from '@/domain/sport'
import { ConflictError } from '@/services/errors'

export async function listClubs(db: SupabaseClient, sport: SportId, q?: string): Promise<Club[]> {
  return clubsRepo.listBySport(db, sport, q)
}

/** Rejects case-insensitive duplicate names within a sport. */
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
