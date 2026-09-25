/**
 * How likely a player is to be known — the metric the game uses to pick a fair random pair,
 * to build a daily challenge, and to award more points for a rarely-known player.
 *
 * `FameDetails` mirrors `player_fame.details` (jsonb): the imported signals that `memberships`
 * cannot carry. Anything that can be computed from memberships — games played, seasons, games
 * per season — is NOT stored here: the score reads it from `memberships` at compute time, so a
 * total and the seasons it is divided by always cover the same clubs and seasons.
 *
 * The bag is open: a new imported signal is added here and in the formula, with no migration.
 *
 * The score that comes out is `player_fame.score` (integer 0..100), written by a separate step
 * and NULL until it runs. It is not modelled here: nothing in `src/` reads it yet, and the only
 * writer is SQL.
 *
 * The formula lives only in SQL. This is the opposite choice to `search_normalize`, which is
 * written twice — in SQL and in `src/lib/searchNormalize.ts` — because the browser has to
 * agree with the database about what matches. Here there is a single writer, so a second
 * implementation would only be a second thing to keep in sync.
 */
export type FameDetails = {
  /** International caps. A national team is not a club, so no membership can carry them. */
  caps?: number
  /** When the import last wrote its signals (ISO 8601). Lets the report spot stale rows. */
  updatedAt?: string
}

/** The signals an import is responsible for. */
export type ImportedFameDetails = Pick<FameDetails, 'caps' | 'updatedAt'>

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * Reads a `details` value that came back from the database.
 *
 * Tolerant by design: the column is open, so a row may carry keys this build has never heard
 * of, or a key written in the wrong type by an older script. Unknown keys are dropped and a
 * malformed value becomes `undefined` rather than throwing.
 */
export function parseFameDetails(raw: unknown): FameDetails {
  if (typeof raw !== 'object' || raw === null) return {}
  const bag = raw as Record<string, unknown>

  const details: FameDetails = {}
  if (isFiniteNumber(bag.caps)) details.caps = bag.caps
  if (typeof bag.updatedAt === 'string') details.updatedAt = bag.updatedAt
  return details
}
