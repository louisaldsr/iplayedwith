/**
 * "2026-09-25" → the reader's own long date, the weekday included. UTC on both sides, so the day
 * never shifts. The year only when asked: today's challenge does not need it, the archive does.
 */
export function formatDay(day: string, withYear = false): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear && { year: 'numeric' }),
  })
}
