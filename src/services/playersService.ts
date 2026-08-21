import { randomUUID } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import * as playersRepo from '@/repositories/playersRepository'
import { PlayerId } from '@/domain/ids'
import { Player } from '@/domain/player'
import { SportId } from '@/domain/sport'
import { Nationality } from '@/domain/nationality'

export async function listPlayers(db: SupabaseClient, sport: SportId, q?: string): Promise<Player[]> {
  return playersRepo.listBySport(db, sport, q)
}

/** No duplicate-name guard: real people can share a name. */
export async function createPlayer(
  db: SupabaseClient,
  input: { name: string; sport: SportId; nationality?: string },
): Promise<Player> {
  const player: Player = {
    id: PlayerId(randomUUID()),
    name: input.name,
    sport: input.sport,
    nationality: input.nationality ? Nationality(input.nationality) : undefined,
  }
  return playersRepo.insert(db, player)
}
