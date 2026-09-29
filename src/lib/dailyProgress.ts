import { SportId, SPORTS } from '@/domain/sport'
import { ChallengeDay, challengeDayOf } from '@/domain/dailyChallenge'

/**
 * Which daily challenges this browser has completed — browser-side only, like `visitor.ts`.
 *
 * One key per sport, `ipw.dailyDone.<sport>`, holding the day of the last challenge won there.
 * Only the latest day matters: a sport is "done" when that day is today, so yesterday's value
 * goes stale by itself at midnight (Paris) with nothing to clean up.
 *
 * Storage failures are swallowed: this only colours the menu, and must never break a game.
 */

const keyOf = (sport: SportId) => `ipw.dailyDone.${sport}`

/** Records that the sport's challenge for `day` has been won. */
export function markDailyDone(sport: SportId, day: ChallengeDay): void {
  try {
    window.localStorage.setItem(keyOf(sport), day)
  } catch {
    // The menu will simply not show it as done.
  }
}

/** The sports whose challenge of the current day has been won in this browser. */
export function sportsDoneToday(now: Date = new Date()): Set<SportId> {
  const today = challengeDayOf(now)
  const done = new Set<SportId>()
  try {
    for (const sport of SPORTS) {
      if (window.localStorage.getItem(keyOf(sport)) === today) done.add(sport)
    }
  } catch {
    // Unreadable storage: nothing shows as done.
  }
  return done
}
