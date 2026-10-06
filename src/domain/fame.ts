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
 * The score that comes out is `player_fame.score` (integer 0..100), written by the SQL function
 * `compute_fame_scores` (revision 3: supabase/migrations/025_fame_v3.sql) and NULL until it runs,
 * with the four pillars behind it in `player_fame.terms` (`FameTerms`). The game never reads the
 * raw score, only its floor (`src/domain/fameFloor.ts`).
 *
 * The formula lives only in SQL. This is the opposite choice to `search_normalize`, which is
 * written twice — in SQL and in `src/lib/searchNormalize.ts` — because the browser has to
 * agree with the database about what matches. Here there is a single writer, so a second
 * implementation would only be a second thing to keep in sync.
 */
export type FameDetails = {
  /** International caps. A national team is not a club, so no membership can carry them. */
  caps?: number
  /**
   * The same caps by national side, as the source labels it ("France", "Spain"). The score weighs
   * each cap by its nation (`nation_tiers`); `caps` stays the plain total, for the report.
   */
  capsByNation?: Record<string, number>
  /**
   * The player's Wikidata item ("Q20666534"), matched on an ID the source shares with Wikidata
   * (All.Rugby ID, Transfermarkt ID) or, for a few experienced players, a unique name. Null when
   * the exposure import found no match: the score then leaves exposure out instead of reading 0.
   */
  wikidataId?: string | null
  /** How `wikidataId` was matched — the ID is exact, a unique name is the fallback. Null: no match. */
  wikidataMatch?: 'id' | 'unique-name' | null
  /**
   * French + English Wikipedia views per year, averaged over `viewsWindow`. Null when the item
   * has no French or English article: not measured, not zero.
   */
  viewsPerYear?: number | null
  /** The months `viewsPerYear` averages, "YYYYMM-YYYYMM". */
  viewsWindow?: string
  /** When the import last wrote its signals (ISO 8601). Lets the report spot stale rows. */
  updatedAt?: string
}

/** The signals `seed:fame` is responsible for. */
export type ImportedFameDetails = Pick<FameDetails, 'caps' | 'capsByNation' | 'updatedAt'>

/** The signals `fame:exposure` is responsible for. */
export type ImportedExposureDetails = Pick<
  FameDetails,
  'wikidataId' | 'wikidataMatch' | 'viewsPerYear' | 'viewsWindow' | 'updatedAt'
>

/**
 * The four pillars behind a score, each 0..1, as `compute_fame_scores` wrote them
 * (`player_fame.terms`). `exposure` is null when the player has no Wikipedia match.
 */
export type FameTerms = { longevity: number; club: number; intl: number; exposure: number | null }

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
  if (typeof bag.capsByNation === 'object' && bag.capsByNation !== null && !Array.isArray(bag.capsByNation)) {
    const byNation: Record<string, number> = {}
    for (const [nation, caps] of Object.entries(bag.capsByNation)) if (isFiniteNumber(caps)) byNation[nation] = caps
    details.capsByNation = byNation
  }
  if (typeof bag.wikidataId === 'string' || bag.wikidataId === null) details.wikidataId = bag.wikidataId
  if (bag.wikidataMatch === 'id' || bag.wikidataMatch === 'unique-name' || bag.wikidataMatch === null) {
    details.wikidataMatch = bag.wikidataMatch
  }
  if (isFiniteNumber(bag.viewsPerYear) || bag.viewsPerYear === null) details.viewsPerYear = bag.viewsPerYear
  if (typeof bag.viewsWindow === 'string') details.viewsWindow = bag.viewsWindow
  if (typeof bag.updatedAt === 'string') details.updatedAt = bag.updatedAt
  return details
}

/** Reads `player_fame.terms`; null when the row has not been scored by revision 3 yet. */
export function parseFameTerms(raw: unknown): FameTerms | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const bag = raw as Record<string, unknown>
  const num = (v: unknown) => (isFiniteNumber(v) ? v : null)
  const longevity = num(bag.longevity)
  const club = num(bag.club)
  const intl = num(bag.intl)
  if (longevity === null || club === null || intl === null) return null
  return { longevity, club, intl, exposure: num(bag.exposure) }
}
