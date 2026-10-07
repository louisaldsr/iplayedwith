import { ChallengeDay, DailyChallenge } from './dailyChallenge'

/**
 * The archive: every daily challenge of a sport up to today, newest first, each with how this
 * visitor did on it — as the server recorded it, never as the browser says.
 *
 * A past day is played like today's (`/[sport]/archive/[day]`, its pair read from here) and counts
 * in the stats and that day's ranking, marked late — never in the streaks (026_daily_archive.sql).
 */

/** The visitor's result on a day. `outcome` is null while it is being played. */
export type DailyArchiveResult = {
  outcome: 'won' | 'lost' | null
  /** Won days only: the extra players (`src/domain/dailyScore.ts`). */
  score: number | null
  /** Guesses linked to nobody — the lives spent. */
  livesLost: number
  /** Started after the day was over. */
  late: boolean
}

export type DailyArchiveEntry = DailyChallenge & {
  /** Null when this visitor never started the day. */
  result: DailyArchiveResult | null
}

export type DailyArchive = {
  /** The server's today (Paris): the newest entry, unless its draw is still missing. */
  today: ChallengeDay
  /** Newest first. */
  days: DailyArchiveEntry[]
}
