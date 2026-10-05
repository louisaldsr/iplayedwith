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
 * One line of a day's ranking — every finished result. Winners first, by score (extra players,
 * `src/domain/dailyScore.ts`) then time; then everyone who lost, all on the rank after the last
 * winner. Lives lost and hints are shown, not ranked.
 */
export type DailyRankingEntry = {
  rank: number
  visitorId: VisitorId
  /** The visitor's username — null if it was never created (Start did not reach the server). */
  username: string | null
  outcome: 'won' | 'lost'
  /** Extra players beyond the fewest needed — won results only. */
  score: number | null
  /** Players added to the board: accepted moves. */
  added: number
  /** The fewest players that connect A and B. */
  needed: number
  /** Every move the server judged: accepted, or refused as linked to nobody. */
  attempts: number
  /** From Start to the final move, both stamped by the server's clock. */
  durationMs: number
  livesLost: number
  /** Length of the winning chain, in links. Won results only. */
  links: number | null
  /** Careers opened during the game (A and B excepted). Shown, not ranked. */
  hints: number
  /** The winning chain, A to B — null when lost, or won before chains were stored (022). */
  pathPlayerIds: string[] | null
  finishedAt: string
}
