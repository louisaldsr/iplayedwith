/**
 * Daily results, as the server records them — see supabase/migrations/015_daily_results.sql.
 *
 * A result belongs to a visitor: the anonymous id a browser mints on its first visit
 * (`src/lib/visitor.ts`). Not a person — a new browser or cleared site data is a new visitor.
 */

/** Branded string for a visitor's anonymous id — a UUID. */
export type VisitorId = string & { readonly _brand: 'VisitorId' }

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isVisitorId(raw: unknown): raw is VisitorId {
  return typeof raw === 'string' && UUID_REGEX.test(raw)
}

/**
 * One line of a day's ranking. Won results only, ordered by fewest attempts, then shortest time —
 * a real score (lives left, fame of the players found) comes later.
 */
export type DailyRankingEntry = {
  rank: number
  visitorId: VisitorId
  /** The visitor's username — null if it was never created (Start did not reach the server). */
  username: string | null
  /** Every move the server judged: accepted, or refused as linked to nobody. */
  attempts: number
  /** From Start to the winning move, both stamped by the server's clock. */
  durationMs: number
  livesLost: number
  /** Length of the winning chain, in links. */
  links: number
  /** Careers opened during the game (A and B excepted). Shown, not ranked — yet. */
  hints: number
  finishedAt: string
}
