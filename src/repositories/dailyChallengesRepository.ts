import { SupabaseClient } from '@supabase/supabase-js'
import { PlayerId } from '@/domain/ids'
import { SportId } from '@/domain/sport'
import { ChallengeDay } from '@/domain/dailyChallenge'

type DailyChallengeRow = {
  sport: SportId
  day: string
  number: number
  player_a_id: string
  player_b_id: string
  optimal_links: number
}

/** A stored challenge, players as ids. The solution column is never selected into this. */
export type StoredDailyChallenge = {
  sport: SportId
  day: ChallengeDay
  number: number
  playerAId: PlayerId
  playerBId: PlayerId
  optimalLinks: number
}

/**
 * The (sport, day) challenge, drawn on first call and returned as stored on every later one.
 *
 * Goes through the `generate_daily_challenge` SQL function: the draw needs a shortest-path
 * search over the whole sport's memberships, which only makes sense next to the data, and the
 * get-or-create has to be atomic so concurrent first visitors converge on one pair.
 * See supabase/migrations/013_daily_challenges.sql.
 *
 * Requires the service_role client — the table and the function are closed to anon.
 */
export async function getOrGenerate(
  db: SupabaseClient,
  sport: SportId,
  day: ChallengeDay,
): Promise<StoredDailyChallenge> {
  const { data, error } = await db.rpc('generate_daily_challenge', { p_sport: sport, p_day: day })
  if (error) throw new Error(error.message)

  const row = data as DailyChallengeRow
  return {
    sport: row.sport,
    day: ChallengeDay(row.day),
    number: row.number,
    playerAId: PlayerId(row.player_a_id),
    playerBId: PlayerId(row.player_b_id),
    optimalLinks: row.optimal_links,
  }
}
