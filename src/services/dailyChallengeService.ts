import { SupabaseClient } from '@supabase/supabase-js'
import * as dailyChallengesRepo from '@/repositories/dailyChallengesRepository'
import * as playersRepo from '@/repositories/playersRepository'
import { SportId } from '@/domain/sport'
import { DailyChallenge, challengeDayOf } from '@/domain/dailyChallenge'
import { NotFoundError } from '@/services/errors'

/**
 * Today's challenge for the sport, drawing it if this is the day's first request.
 *
 * `now` is a parameter so the day boundary can be tested; callers leave it out.
 */
export async function getDailyChallenge(
  db: SupabaseClient,
  sport: SportId,
  now: Date = new Date(),
): Promise<DailyChallenge> {
  const stored = await dailyChallengesRepo.getOrGenerate(db, sport, challengeDayOf(now))

  const players = await playersRepo.findManyByIds(db, [stored.playerAId, stored.playerBId])
  const playerA = players.find((p) => p.id === stored.playerAId)
  const playerB = players.find((p) => p.id === stored.playerBId)
  // Unreachable while the foreign keys hold; guards against a player deleted from under a
  // stored challenge.
  if (!playerA || !playerB) {
    throw new NotFoundError(`a player of the ${sport} challenge for ${stored.day} no longer exists`)
  }

  return { sport, day: stored.day, number: stored.number, playerA, playerB, optimalLinks: stored.optimalLinks }
}
