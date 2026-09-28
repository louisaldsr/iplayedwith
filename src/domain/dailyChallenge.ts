import { Player } from './player'
import { SportId } from './sport'

/** Branded string for the calendar day a challenge belongs to, in "YYYY-MM-DD" format. */
export type ChallengeDay = string & { readonly _brand: 'ChallengeDay' }

const CHALLENGE_DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Smart constructor for ChallengeDay.
 * Validates the format and that the date exists (no "2026-02-30").
 *
 * @throws if the string is not a real calendar day.
 */
export const ChallengeDay = (raw: string): ChallengeDay => {
  if (!CHALLENGE_DAY_REGEX.test(raw)) throw new Error(`Invalid challenge day format: ${raw}`)
  const date = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new Error(`Invalid challenge day: ${raw}`)
  }
  return raw as ChallengeDay
}

/**
 * The time zone that decides when a new challenge starts — one day for everyone.
 *
 * Written twice: here for the API, and in the pg_cron job of 013_daily_challenges.sql that
 * posts each day's challenge. Change both together.
 *
 * A per-user local day would let a player in a later time zone see the pair before others,
 * and a ranking per day needs everyone on the same pair. Paris, because that is the audience.
 */
export const CHALLENGE_TIME_ZONE = 'Europe/Paris'

// en-CA formats as YYYY-MM-DD, which is exactly the ChallengeDay format.
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CHALLENGE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The challenge day `now` falls in. */
export function challengeDayOf(now: Date): ChallengeDay {
  return ChallengeDay(dayFormatter.format(now))
}

/**
 * The day's pair, as the API sends it.
 *
 * The stored solution is deliberately absent: it stays on the server while the day runs.
 */
export type DailyChallenge = {
  sport: SportId
  day: ChallengeDay
  /** Wordle-style number within the sport: the launch day is #1, then one per calendar day. */
  number: number
  playerA: Player
  playerB: Player
  /** Length of the shortest chain from A to B, in links (A—X—B = 2). Always ≥ 2. */
  optimalLinks: number
}
