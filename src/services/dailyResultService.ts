import { SupabaseClient } from '@supabase/supabase-js'
import * as dailyResultsRepo from '@/repositories/dailyResultsRepository'
import { ensureUsername } from '@/services/visitorService'
import { SportId } from '@/domain/sport'
import { ChallengeDay, challengeDayOf, DAILY_LIVES } from '@/domain/dailyChallenge'
import { DailyRankingEntry, VisitorId } from '@/domain/dailyResult'
import { DailyStats, dailyStats } from '@/domain/dailyScore'
import { MoveResult } from '@/services/moveService'
import { ConflictError } from '@/services/errors'

/**
 * The server's record of each visitor's daily challenge — what the day's ranking is computed from.
 *
 * The browser only says who it is. What it did is what the server saw: the moves it judged and
 * the times on its own clock. The day is always the server's (`challengeDayOf`).
 *
 * `now` is a parameter so the day boundary can be tested; callers leave it out.
 */

/**
 * Stamps "Start" on today's challenge. `day` is the one the client was shown: past midnight it is
 * stale.
 *
 * Also the visitor's first sight by the server: it gets its generated name here, once. A name that
 * fails to be drawn is only logged — the result matters more than the name, and the next Start
 * tries again.
 */
export async function startDailyResult(
  db: SupabaseClient,
  sport: SportId,
  day: ChallengeDay,
  visitorId: VisitorId,
  now: Date = new Date(),
): Promise<void> {
  if (day !== challengeDayOf(now)) throw new ConflictError(`${day} is not today's challenge`)
  await ensureUsername(db, visitorId).catch((err) => console.error('visitor name not created', err))
  await dailyResultsRepo.start(db, sport, day, visitorId)
}

/**
 * Counts a daily move once the server has judged it. Only real guesses count as attempts: an
 * accepted move, or one refused as linked to nobody — which also costs a life. A duplicate or a
 * move after the end is not an attempt, and a move that never reached the rules is not recorded at
 * all.
 *
 * The pair is checked in SQL against today's: a board left open past midnight is not recorded.
 */
export async function recordDailyMove(
  db: SupabaseClient,
  sport: SportId,
  move: { visitorId: VisitorId; playerAId: string; playerBId: string },
  result: MoveResult,
  now: Date = new Date(),
): Promise<void> {
  const costsLife = !result.ok && result.code === 'not-connected'
  if (!result.ok && !costsLife) return

  const won = result.ok && result.victory
  await dailyResultsRepo.recordMove(db, {
    sport,
    day: challengeDayOf(now),
    ...move,
    costsLife,
    links: won ? result.path.length - 1 : null,
    path: won ? result.path : null,
    maxLives: DAILY_LIVES,
  })
}

/**
 * Records a career opened during today's challenge — a hint. `day` is the one the client was
 * shown: past midnight it is stale. A, B, unknown players and finished days are filtered in SQL.
 */
export async function recordDailyHint(
  db: SupabaseClient,
  sport: SportId,
  day: ChallengeDay,
  visitorId: VisitorId,
  playerId: string,
  now: Date = new Date(),
): Promise<void> {
  if (day !== challengeDayOf(now)) throw new ConflictError(`${day} is not today's challenge`)
  await dailyResultsRepo.recordHint(db, sport, day, visitorId, playerId)
}

/**
 * The day's ranking: winners by score (extra players), then fastest; then everyone who lost, on
 * one shared rank.
 */
export function getDailyRanking(db: SupabaseClient, sport: SportId, day: ChallengeDay): Promise<DailyRankingEntry[]> {
  return dailyResultsRepo.ranking(db, sport, day)
}

/** The visitor's stats in the sport — played, streaks, score distribution — as of today (Paris). */
export async function getDailyStats(
  db: SupabaseClient,
  sport: SportId,
  visitorId: VisitorId,
  now: Date = new Date(),
): Promise<DailyStats> {
  return dailyStats(await dailyResultsRepo.visitorDays(db, sport, visitorId), challengeDayOf(now))
}
