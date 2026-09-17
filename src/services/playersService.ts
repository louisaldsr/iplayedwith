import { randomUUID } from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import * as playersRepo from '@/repositories/playersRepository'
import { PlayerId } from '@/domain/ids'
import { Player } from '@/domain/player'
import { SportId } from '@/domain/sport'
import { Nationality } from '@/domain/nationality'

export async function listPlayers(db: SupabaseClient, sport: SportId, q?: string): Promise<Player[]> {
  return q ? playersRepo.searchBySport(db, sport, q) : playersRepo.listBySport(db, sport)
}

/** A random player from the sport, optionally excluding one already picked. */
export async function randomPlayer(
  db: SupabaseClient,
  sport: SportId,
  excludeId?: PlayerId,
): Promise<Player | null> {
  return playersRepo.findRandom(db, sport, excludeId)
}

export type CreatePlayerInput = { name: string; sport: SportId; nationality?: string }

function toNewPlayer(input: CreatePlayerInput): Player {
  return {
    id: PlayerId(randomUUID()),
    name: input.name,
    sport: input.sport,
    nationality: input.nationality ? Nationality(input.nationality) : undefined,
  }
}

/** No duplicate-name guard: real people can share a name. */
export async function createPlayer(db: SupabaseClient, input: CreatePlayerInput): Promise<Player> {
  return playersRepo.insert(db, toNewPlayer(input))
}

/**
 * Bulk counterpart to `createPlayer`, for seed imports. Same id generation and
 * `Nationality` validation, applied to every input before anything is written — an
 * invalid code fails the call rather than leaving a half-written batch behind.
 */
export async function createPlayers(db: SupabaseClient, inputs: CreatePlayerInput[]): Promise<Player[]> {
  return playersRepo.insertMany(db, inputs.map(toNewPlayer))
}
