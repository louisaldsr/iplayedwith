/**
 * Branded string representing a sport season, in one of two shapes:
 *
 * - **split** — "YYYY-YYYY", a season across two calendar years (rugby, football, the NBA):
 *   "2022-2023";
 * - **calendar** — "YYYY", a season inside one calendar year (Formula 1): "2022".
 *
 * A sport uses one shape only — the database guarantees it (`sports.season_format`, migration 030).
 * The game never asks which: years are read through `startYear` / `endYear`, never sliced.
 */
export type Season = string & { readonly _brand: 'Season' }

export type SeasonFormat = 'split' | 'calendar'

const SEASON_REGEX = /^\d{4}(-\d{4})?$/

/**
 * Smart constructor for Season.
 * Validates that the raw string reads "YYYY-YYYY" or "YYYY", and that a split season's end year is
 * exactly one year after its start year.
 *
 * @throws if the format is invalid or the year range is not consecutive.
 */
export const Season = (raw: string): Season => {
  if (!SEASON_REGEX.test(raw)) throw new Error(`Invalid season format: ${raw}`)
  if (!hasConsecutiveYears(raw)) throw new Error(`Invalid season range: ${raw}`)
  return raw as Season
}

/**
 * Non-throwing counterpart to `Season`, for validating untrusted input.
 *
 * Request parsing checks many fields and reports its own errors, so a predicate reads
 * better there than catching what the smart constructor throws.
 */
export function isSeason(raw: string): raw is Season {
  return SEASON_REGEX.test(raw) && hasConsecutiveYears(raw)
}

/** A calendar season has a single year; a split one must end the year after it starts. */
function hasConsecutiveYears(raw: string): boolean {
  if (raw.length === 4) return true
  return Number(raw.slice(5)) === Number(raw.slice(0, 4)) + 1
}

export function seasonFormatOf(season: Season): SeasonFormat {
  return season.length === 4 ? 'calendar' : 'split'
}

/** The year the season starts: 2022 for "2022-2023" and for "2022". */
export const startYear = (season: Season): number => Number(season.slice(0, 4))

/** The year the season ends: 2023 for "2022-2023", 2022 for "2022". */
export const endYear = (season: Season): number => Number(season.slice(-4))

/**
 * A run of seasons as a reader says it: "2015-2016" … "2019-2020" → "2015 – 2020". A run inside
 * one year is that year alone ("2021", one Formula 1 season); a single split season keeps both
 * years ("2015 – 2016").
 */
export function formatSeasonSpan(from: Season, to: Season): string {
  const first = startYear(from)
  const last = endYear(to)
  return first === last ? String(first) : `${first} – ${last}`
}

/**
 * The last season the dataset covers — the same for every sport.
 *
 * Sources keep publishing the season in progress (a scraped site adds each round as it is
 * played), but a season that has barely started is not comparable with the finished ones: a
 * club's squad is a handful of names, every game count is tiny, and nothing else in the
 * database reaches it. So memberships stop here, and every import skips what comes after.
 *
 * Compared by START year, so it holds for both shapes: with "2025-2026", a calendar sport keeps
 * "2025" and skips "2026" — the season being raced while the split sports play 2025-2026.
 *
 * Moving the dataset forward is a deliberate step: bump this, then re-run the imports.
 */
export const LATEST_SEASON = Season('2025-2026')

/** True when `season` starts after `LATEST_SEASON` — i.e. it is out of the dataset. */
export function isAfterLatestSeason(season: Season): boolean {
  return startYear(season) > startYear(LATEST_SEASON)
}
