import { SupabaseClient } from '@supabase/supabase-js'
import { SportId } from '@/domain/sport'
import { ChallengeDay } from '@/domain/dailyChallenge'
import { DailyRankingEntry, VisitorId } from '@/domain/dailyResult'
import { DailyDayResult } from '@/domain/dailyScore'

/**
 * Daily results, written and read through the SQL functions of 015_daily_results.sql (scored by
 * 022_daily_score.sql): the counting and the freezing of a finished result have to be atomic, next
 * to the row.
 *
 * Requires the service_role client — the table and the functions are closed to anon.
 */

/** Stamps the visitor's start on the day. Idempotent: the first Start wins. */
export async function start(db: SupabaseClient, sport: SportId, day: ChallengeDay, visitorId: VisitorId) {
  const { error } = await db.rpc('start_daily_result', { p_sport: sport, p_day: day, p_visitor: visitorId })
  if (error) throw new Error(error.message)
}

export type RecordedMove = {
  sport: SportId
  day: ChallengeDay
  visitorId: VisitorId
  playerAId: string
  playerBId: string
  costsLife: boolean
  /** Set when the move won: the chain's length in links, and the chain itself, A to B. */
  links: number | null
  path: string[] | null
  maxLives: number
}

/** Counts one judged move. Ignored by the database if the pair is not that day's, or the day is over. */
export async function recordMove(db: SupabaseClient, move: RecordedMove) {
  const { error } = await db.rpc('record_daily_move', {
    p_sport: move.sport,
    p_day: move.day,
    p_visitor: move.visitorId,
    p_player_a: move.playerAId,
    p_player_b: move.playerBId,
    p_costs_life: move.costsLife,
    p_links: move.links,
    p_max_lives: move.maxLives,
    p_path: move.path,
  })
  if (error) throw new Error(error.message)
}

/** Adds a player to the visitor's hints for the day. Ignored for A, B, an unknown player or a finished day. */
export async function recordHint(
  db: SupabaseClient,
  sport: SportId,
  day: ChallengeDay,
  visitorId: VisitorId,
  playerId: string,
) {
  const { error } = await db.rpc('record_daily_hint', {
    p_sport: sport,
    p_day: day,
    p_visitor: visitorId,
    p_player: playerId,
  })
  if (error) throw new Error(error.message)
}

type RankingRow = {
  rank: number
  visitor_id: string
  username: string | null
  outcome: 'won' | 'lost'
  score: number | null
  added: number
  needed: number
  attempts: number
  duration_ms: number
  lives_lost: number
  links: number | null
  hints: number
  path_player_ids: string[] | null
  finished_at: string
}

export async function ranking(db: SupabaseClient, sport: SportId, day: ChallengeDay): Promise<DailyRankingEntry[]> {
  const { data, error } = await db.rpc('daily_ranking', { p_sport: sport, p_day: day })
  if (error) throw new Error(error.message)
  return (data as RankingRow[]).map((r) => ({
    rank: Number(r.rank),
    visitorId: r.visitor_id as VisitorId,
    username: r.username,
    outcome: r.outcome,
    score: r.score,
    added: r.added,
    needed: r.needed,
    attempts: r.attempts,
    durationMs: Number(r.duration_ms),
    livesLost: r.lives_lost,
    links: r.links,
    hints: r.hints,
    pathPlayerIds: r.path_player_ids,
    finishedAt: r.finished_at,
  }))
}

type StatsRow = {
  day: string
  outcome: 'won' | 'lost' | null
  score: number | null
}

/** Every day the visitor has a result for in the sport, unfinished ones included, oldest first. */
export async function visitorDays(db: SupabaseClient, sport: SportId, visitorId: VisitorId): Promise<DailyDayResult[]> {
  const { data, error } = await db.rpc('daily_stats', { p_sport: sport, p_visitor: visitorId })
  if (error) throw new Error(error.message)
  return (data as StatsRow[]).map((r) => ({ day: ChallengeDay(r.day), outcome: r.outcome, score: r.score }))
}
