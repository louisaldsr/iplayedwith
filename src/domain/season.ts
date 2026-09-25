/** Branded string representing a sport season in "YYYY-YYYY" format (e.g. "2022-2023"). */
export type Season = string & { readonly _brand: 'Season' }

const SEASON_REGEX = /^\d{4}-\d{4}$/

/**
 * Smart constructor for Season.
 * Validates that the raw string matches "YYYY-YYYY" and that the end year is
 * exactly one year after the start year.
 *
 * @throws if the format is invalid or the year range is not consecutive.
 */
export const Season = (raw: string): Season => {
  if (!SEASON_REGEX.test(raw)) throw new Error(`Invalid season format: ${raw}`)
  const [start, end] = raw.split('-').map(Number)
  if (end !== start + 1) throw new Error(`Invalid season range: ${raw}`)
  return raw as Season
}

/**
 * Non-throwing counterpart to `Season`, for validating untrusted input.
 *
 * Request parsing checks many fields and reports its own errors, so a predicate reads
 * better there than catching what the smart constructor throws.
 */
export function isSeason(raw: string): raw is Season {
  if (!SEASON_REGEX.test(raw)) return false
  const [start, end] = raw.split('-').map(Number)
  return end === start + 1
}

/**
 * The last season the dataset covers — the same for every sport.
 *
 * Sources keep publishing the season in progress (a scraped site adds each round as it is
 * played), but a season that has barely started is not comparable with the finished ones: a
 * club's squad is a handful of names, every game count is tiny, and nothing else in the
 * database reaches it. So memberships stop here, and every import skips what comes after.
 *
 * Moving the dataset forward is a deliberate step: bump this, then re-run the imports.
 */
export const LATEST_SEASON = Season('2025-2026')

/** True when `season` starts after `LATEST_SEASON` — i.e. it is out of the dataset. */
export function isAfterLatestSeason(season: Season): boolean {
  return startYear(season) > startYear(LATEST_SEASON)
}

const startYear = (season: Season): number => Number(season.slice(0, 4))
