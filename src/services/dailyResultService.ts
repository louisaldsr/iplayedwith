import { SupabaseClient } from '@supabase/supabase-js'
import * as dailyResultsRepo from '@/repositories/dailyResultsRepository'
import { ensureUsername } from '@/services/visitorService'
import { SportId } from '@/domain/sport'
import { ChallengeDay, challengeDayOf, DAILY_LIVES, isPlayableDay } from '@/domain/dailyChallenge'
import { DailyRankingEntry, VisitorId } from '@/domain/dailyResult'
import { DailyStats, dailyStats } from '@/domain/dailyScore'
import { DailyLeaderboard, toLeaderboard } from '@/domain/dailyLeaderboard'
import { MoveResult } from '@/services/moveService'
import { ConflictError } from '@/services/errors'

/**
 * The server's record of each visitor's daily challenge — what the day's ranking is computed from.
 *
 * The browser only says who it is, and which day it plays: today's, or a past one from the archive —
 * never a future one. What it did is what the server saw: the moves it judged and the times on its
 * own clock. Whether a day was played late is the server's call too: Start on its clock, after the
 * day (026_daily_archive.sql).
 *
 * `now` is a parameter so the day boundary can be tested; callers leave it out.
 */

/**
 * Stamps "Start" on a day's challenge — today's, or a past one played late.
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
  if (!isPlayableDay(day, challengeDayOf(now))) throw new ConflictError(`${day} is not playable yet`)
  await ensureUsername(db, visitorId).catch((err) => console.error('visitor name not created', err))
  await dailyResultsRepo.start(db, sport, day, visitorId)
}

/**
 * Counts a daily move once the server has judged it. Only real guesses count as attempts: an
 * accepted move, or one refused as linked to nobody — which also costs a life. A duplicate or a
 * move after the end is not an attempt, and a move that never reached the rules is not recorded at
 * all.
 *
 * `day` is the one the board was drawn for; a client from before the archive sends none, which
 * means today. The pair is checked in SQL against that day's: a move cannot be counted on a day it
 * was not played for. A future day is never recorded.
 */
export async function recordDailyMove(
  db: SupabaseClient,
  sport: SportId,
  move: { visitorId: VisitorId; day?: ChallengeDay; playerAId: string; playerBId: string },
  result: MoveResult,
  now: Date = new Date(),
): Promise<void> {
  const costsLife = !result.ok && result.code === 'not-connected'
  if (!result.ok && !costsLife) return

  const today = challengeDayOf(now)
  const { day = today, ...played } = move
  if (!isPlayableDay(day, today)) return

  const won = result.ok && result.victory
  await dailyResultsRepo.recordMove(db, {
    sport,
    day,
    ...played,
    costsLife,
    links: won ? result.path.length - 1 : null,
    path: won ? result.path : null,
    maxLives: DAILY_LIVES,
  })
}

/**
 * Records a career opened during a day's challenge — a hint. Today's or a past one, never a future
 * one. A, B, unknown players and finished days are filtered in SQL.
 */
export async function recordDailyHint(
  db: SupabaseClient,
  sport: SportId,
  day: ChallengeDay,
  visitorId: VisitorId,
  playerId: string,
  now: Date = new Date(),
): Promise<void> {
  if (!isPlayableDay(day, challengeDayOf(now))) throw new ConflictError(`${day} is not playable yet`)
  await dailyResultsRepo.recordHint(db, sport, day, visitorId, playerId)
}

/**
 * The day's ranking: winners by score (extra players), then fastest — on-time ones, then late ones;
 * then everyone who lost, on one shared rank.
 */
export function getDailyRanking(db: SupabaseClient, sport: SportId, day: ChallengeDay): Promise<DailyRankingEntry[]> {
  return dailyResultsRepo.ranking(db, sport, day)
}

/**
 * What players see of today's ranking (Paris): the podium and the visitor's own place, out of
 * everyone who finished. `visitorId` is null for a browser without one: the podium alone.
 *
 * Cut from the whole ranking, read in full: fine while a day has hundreds of results. When it has
 * thousands, move the cut into SQL.
 */
export async function getDailyLeaderboard(
  db: SupabaseClient,
  sport: SportId,
  visitorId: VisitorId | null,
  now: Date = new Date(),
): Promise<DailyLeaderboard> {
  const day = challengeDayOf(now)
  return toLeaderboard(await dailyResultsRepo.ranking(db, sport, day), day, visitorId)
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
