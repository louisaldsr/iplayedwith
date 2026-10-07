import { ChallengeDay } from './dailyChallenge'
import { DailyRankingEntry, VisitorId } from './dailyResult'

/**
 * What players see of a day's ranking: the podium — the first winners — and their own place
 * among everyone who finished. Cut from the full ranking (`daily_ranking`, 026_daily_archive.sql),
 * which keeps the order: winners by score then time — on-time ones, then those who played the day
 * late from the archive — then everyone who lost on one shared rank.
 *
 * Never in here, because it leaves for the browser:
 * - another visitor's id — whoever has it can rename that visitor;
 * - a winner's chain — it would give away a shortest path to anyone still playing.
 */

export const PODIUM_SIZE = 3

export type PodiumEntry = {
  /** Shared on a tie. */
  rank: number
  /** Null if the name was never created (Start did not reach the server). */
  username: string | null
  score: number
  durationMs: number
  /** Played late, from the archive — on the podium only when fewer have won on time. */
  late: boolean
  /** The visitor asking. */
  you: boolean
}

export type YourPlace = {
  /** For a loss: the rank every loser shares, after the last winner. */
  rank: number
  outcome: 'won' | 'lost'
  /** Won days only. */
  score: number | null
  durationMs: number
  late: boolean
}

export type DailyLeaderboard = {
  day: ChallengeDay
  /** Every result finished on that day's challenge, won or lost. */
  total: number
  /** Up to `PODIUM_SIZE` winners, best first. Shorter when fewer have won — losers never stand on it. */
  podium: PodiumEntry[]
  /** Null until the visitor has finished the day (or for a visitor the server never saw). */
  you: YourPlace | null
}

/**
 * The leaderboard, from the day's ranking in its order. A tie on the podium's last step is cut by
 * that order: the earlier finisher stays.
 */
export function toLeaderboard(
  ranking: DailyRankingEntry[],
  day: ChallengeDay,
  visitorId: VisitorId | null,
  size = PODIUM_SIZE,
): DailyLeaderboard {
  const podium = ranking
    .filter((e) => e.outcome === 'won' && e.score !== null)
    .slice(0, size)
    .map((e) => ({
      rank: e.rank,
      username: e.username,
      score: e.score as number,
      durationMs: e.durationMs,
      late: e.late,
      you: e.visitorId === visitorId,
    }))
  const mine = visitorId ? ranking.find((e) => e.visitorId === visitorId) : undefined
  return {
    day,
    total: ranking.length,
    podium,
    you: mine
      ? { rank: mine.rank, outcome: mine.outcome, score: mine.score, durationMs: mine.durationMs, late: mine.late }
      : null,
  }
}
