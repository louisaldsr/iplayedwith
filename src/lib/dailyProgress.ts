import { SportId, SPORTS } from '@/domain/sport'
import { ChallengeDay, challengeDayOf, DAILY_LIVES } from '@/domain/dailyChallenge'

/**
 * This browser's progress on each sport's daily challenge — browser-side only, like `visitor.ts`.
 *
 * One key per sport, `ipw.daily.<sport>`, holding the latest day played there: lives left and,
 * once over, whether it was won or lost. Only the latest day matters — a record for another day
 * reads as a fresh start, so yesterday's goes stale by itself at midnight (Paris).
 *
 * It is what makes lives stick: without it a reload would refill them, and a lost day could be
 * replayed at once. It is NOT tamper-proof — clearing site data resets it. Real enforcement needs
 * results stored on the server, which comes with accounts and the ranking.
 *
 * Storage failures are swallowed: a game must never break because the browser blocks storage.
 */

export type DailyOutcome = 'won' | 'lost'

export type DailyRecord = {
  livesLeft: number
  /** Set once the day is over; absent while it can still be played. */
  outcome?: DailyOutcome
}

type StoredRecord = DailyRecord & { day: string }

const keyOf = (sport: SportId) => `ipw.daily.${sport}`

const fresh = (): DailyRecord => ({ livesLeft: DAILY_LIVES })

function readStored(sport: SportId): StoredRecord | null {
  try {
    const raw = window.localStorage.getItem(keyOf(sport))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredRecord>
    if (typeof parsed.day !== 'string' || typeof parsed.livesLeft !== 'number') return null
    const livesLeft = Math.max(0, Math.min(DAILY_LIVES, Math.floor(parsed.livesLeft)))
    const outcome = parsed.outcome === 'won' || parsed.outcome === 'lost' ? parsed.outcome : undefined
    return { day: parsed.day, livesLeft, outcome }
  } catch {
    return null
  }
}

/** Where this browser stands on the sport's challenge for `day` — a fresh start if never played. */
export function readDailyRecord(sport: SportId, day: ChallengeDay): DailyRecord {
  const stored = readStored(sport)
  if (!stored || stored.day !== day) return fresh()
  return { livesLeft: stored.livesLeft, outcome: stored.outcome }
}

export function saveDailyRecord(sport: SportId, day: ChallengeDay, record: DailyRecord): void {
  try {
    window.localStorage.setItem(keyOf(sport), JSON.stringify({ day, ...record }))
  } catch {
    // Lives will not survive a reload; the game itself still works.
  }
}

/** How each sport's challenge of the current day ended in this browser; unfinished ones are absent. */
export function dailyOutcomesToday(now: Date = new Date()): Map<SportId, DailyOutcome> {
  const today = challengeDayOf(now)
  const outcomes = new Map<SportId, DailyOutcome>()
  for (const sport of SPORTS) {
    const stored = readStored(sport)
    if (stored?.day === today && stored.outcome) outcomes.set(sport, stored.outcome)
  }
  return outcomes
}
