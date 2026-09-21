/**
 * How likely a player is to be known — the metric the game uses to pick a fair random pair,
 * to build a daily challenge, and to award more points for a rarely-known player.
 *
 * Two shapes, matching the two columns added by 010_player_fame.sql:
 *
 * - `FameDetails` mirrors `players.fame_details` (jsonb): the raw INPUTS, an open set. A new
 *   signal is added here and in the SQL function, with no migration of the bag itself.
 * - the score is `players.fame` (integer 0..100), a GENERATED column derived from the bag.
 *   It is deliberately not modelled here: nothing in `src/` reads it yet, and nothing may
 *   write it — Postgres rejects a direct write to a generated column.
 *
 * The formula lives only in SQL (`compute_fame`). This is the opposite choice to
 * `search_normalize`, which is written twice — in SQL and in `src/lib/searchNormalize.ts` —
 * because the browser has to agree with the database about what matches. Here there is a
 * single writer, so a second implementation would only be a second thing to keep in sync.
 */
export type FameDetails = {
  /** Matches played over the career, counted within the game's own scope (see the import scripts). */
  gamesPlayed?: number
  /** International caps. Partial coverage on the football side — Transfermarkt fills it for ~39% of players. */
  caps?: number
  /**
   * Distinct seasons, derived from `memberships` by `refresh_fame_seasons()` — never written
   * by an import.
   *
   * Not a term of the score on its own: corr(gamesPlayed, seasons) = 0.933 measured over the
   * 11,455 football players, so adding it would just be counting matches twice. It earns its
   * place as the DIVISOR of `gamesPlayed / seasons` — starter or rotation player — which is a
   * genuinely independent signal.
   */
  seasons?: number
  /** When the import last wrote its signals (ISO 8601). Lets the report spot stale rows. */
  updatedAt?: string
}

/** The signals an import is responsible for. `seasons` is derived in SQL, so it is not here. */
export type ImportedFameDetails = Pick<FameDetails, 'gamesPlayed' | 'caps' | 'updatedAt'>

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * Reads a `fame_details` value that came back from the database.
 *
 * Tolerant by design: the column is open, so a row may carry keys this build has never heard
 * of, or a key written in the wrong type by an older script. Unknown keys are dropped and a
 * malformed value becomes `undefined` rather than throwing — the same stance the SQL side
 * takes, where a non-numeric `gamesPlayed` is read as 0 instead of failing the whole batch.
 */
export function parseFameDetails(raw: unknown): FameDetails {
  if (typeof raw !== 'object' || raw === null) return {}
  const bag = raw as Record<string, unknown>

  const details: FameDetails = {}
  if (isFiniteNumber(bag.gamesPlayed)) details.gamesPlayed = bag.gamesPlayed
  if (isFiniteNumber(bag.caps)) details.caps = bag.caps
  if (isFiniteNumber(bag.seasons)) details.seasons = bag.seasons
  if (typeof bag.updatedAt === 'string') details.updatedAt = bag.updatedAt
  return details
}
