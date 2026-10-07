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

/** A stored challenge, players as ids. The solution column is never selected into this — see `findSolution`. */
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

  return toStored(data as DailyChallengeRow)
}

// Never `*`: the row holds the solution.
const PUBLIC_COLUMNS = 'sport, day, number, player_a_id, player_b_id, optimal_links'

/**
 * Every challenge of the sport up to `lastDay` included, newest first — the archive. `lastDay` is
 * today: tomorrow's pair is already drawn, and must not be listed.
 *
 * Unbounded: one row a day since the launch, a few hundred a year.
 */
export async function listUpTo(
  db: SupabaseClient,
  sport: SportId,
  lastDay: ChallengeDay,
): Promise<StoredDailyChallenge[]> {
  const { data, error } = await db
    .from('daily_challenges')
    .select(PUBLIC_COLUMNS)
    .eq('sport', sport)
    .lte('day', lastDay)
    .order('day', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as DailyChallengeRow[]).map(toStored)
}

function toStored(row: DailyChallengeRow): StoredDailyChallenge {
  return {
    sport: row.sport,
    day: ChallengeDay(row.day),
    number: row.number,
    playerAId: PlayerId(row.player_a_id),
    playerBId: PlayerId(row.player_b_id),
    optimalLinks: row.optimal_links,
  }
}

/**
 * The day's stored solution — one shortest chain, A to B — or null for a day without a challenge.
 * The only read of the column: the service hands it out only once a visitor's day is over.
 */
export async function findSolution(db: SupabaseClient, sport: SportId, day: ChallengeDay): Promise<PlayerId[] | null> {
  const { data, error } = await db
    .from('daily_challenges')
    .select('solution')
    .eq('sport', sport)
    .eq('day', day)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? (data.solution as string[]).map(PlayerId) : null
}
