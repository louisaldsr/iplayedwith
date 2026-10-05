import { ChallengeDay } from './dailyChallenge'

/**
 * The daily challenge's score — the extra players: how many more than the shortest chain needed.
 *
 *   added  = players added to the board (accepted moves)
 *   needed = optimal_links − 1 — the fewest players that connect A and B
 *   score  = added − needed       → "Perfect!", "+1", "+2"…
 *
 * Every player added counts, on the chain or not: a dead end costs as much as a detour, so adding
 * players never pays. Never negative — no chain is shorter than the optimum. No limit either: the
 * day is only lost on lives.
 *
 * Lives decide only whether the day is won: a guess linked to nobody costs a life, never a point.
 * Time is not in the score — it only breaks ties in the ranking.
 *
 * The extra players are what compares one day with another: the players added depend on the day's
 * pair, "+1" always means one player more than needed.
 *
 * ⚠️ Written twice: here, and in `daily_ranking` / `daily_stats` (022_daily_score.sql). Change both.
 */

export function playersNeeded(optimalLinks: number): number {
  return optimalLinks - 1
}

export function dailyScore(added: number, optimalLinks: number): number {
  return added - playersNeeded(optimalLinks)
}

/** `perfectLabel` for 0, "+N" above. */
export function formatScore(score: number, perfectLabel: string): string {
  return score === 0 ? perfectLabel : `+${score}`
}

/**
 * The score buckets of the stats' distribution: Perfect, +1 … +5, then +6 and worse together.
 * Lost days have a bucket of their own, next to these.
 */
export const SCORE_BUCKET_COUNT = 7

export function scoreBucketOf(score: number): number {
  return Math.min(Math.max(0, score), SCORE_BUCKET_COUNT - 1)
}

/** Perfect, "+1" … "+5", "+6+". */
export function formatScoreBucket(bucket: number, perfectLabel: string): string {
  return bucket === SCORE_BUCKET_COUNT - 1 ? `+${bucket}+` : formatScore(bucket, perfectLabel)
}

// ─── Personal stats ───────────────────────────────────────────────────────────

/** One day of a visitor's daily, as the server recorded it. `outcome` is null while unfinished. */
export type DailyDayResult = {
  day: ChallengeDay
  outcome: 'won' | 'lost' | null
  /** Won days only. */
  score: number | null
}

/** Today's place in the stats: the bucket it fell in, or `'lost'`. */
export type TodayBucket = number | 'lost'

export type DailyStats = {
  /** Finished days, won or lost. */
  played: number
  won: number
  /** Days won in a row, up to today — or up to yesterday while today is not finished. */
  currentStreak: number
  bestStreak: number
  /** Mean score of the won days; null before the first win. */
  averageScore: number | null
  /** Won days per score bucket (`SCORE_BUCKET_COUNT` of them). */
  distribution: number[]
  lost: number
  /** Null while today is not finished. */
  today: TodayBucket | null
}

/** The calendar day `days` after `day` (before, if negative). */
function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * A visitor's stats in one sport — the Wordle ones.
 *
 * Streaks follow the calendar: a challenge is posted every day (`ensure_daily_challenges`), so a
 * day not played, or started and never finished, breaks the run. Today, not finished yet, does not.
 */
export function dailyStats(results: DailyDayResult[], today: ChallengeDay): DailyStats {
  const distribution = new Array<number>(SCORE_BUCKET_COUNT).fill(0)
  const wonDays = new Set<string>()
  let lost = 0
  let scoreSum = 0
  let todayBucket: TodayBucket | null = null

  for (const r of results) {
    if (r.outcome === 'won' && r.score !== null) {
      const bucket = scoreBucketOf(r.score)
      distribution[bucket]++
      wonDays.add(r.day)
      scoreSum += r.score
      if (r.day === today) todayBucket = bucket
    } else if (r.outcome === 'lost') {
      lost++
      if (r.day === today) todayBucket = 'lost'
    }
  }

  // Today counts once won, ends the run once lost, and is skipped while unfinished.
  let currentStreak = 0
  if (todayBucket !== 'lost') {
    for (let day = todayBucket === null ? shiftDay(today, -1) : today; wonDays.has(day); day = shiftDay(day, -1)) {
      currentStreak++
    }
  }

  let bestStreak = 0
  for (const day of wonDays) {
    if (wonDays.has(shiftDay(day, -1))) continue // not the start of a run
    let run = 0
    for (let d = day; wonDays.has(d); d = shiftDay(d, 1)) run++
    bestStreak = Math.max(bestStreak, run)
  }

  return {
    played: wonDays.size + lost,
    won: wonDays.size,
    currentStreak,
    bestStreak,
    averageScore: wonDays.size ? scoreSum / wonDays.size : null,
    distribution,
    lost,
    today: todayBucket,
  }
}
