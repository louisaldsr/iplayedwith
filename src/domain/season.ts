/** Branded string representing a sport season in "YYYY-YYYY" format (e.g. "2022-2023"). */
export type Season = string & { readonly _brand: 'Season' };

const SEASON_REGEX = /^\d{4}-\d{4}$/;

/**
 * Smart constructor for Season.
 * Validates that the raw string matches "YYYY-YYYY" and that the end year is
 * exactly one year after the start year.
 *
 * @throws if the format is invalid or the year range is not consecutive.
 */
export const Season = (raw: string): Season => {
  if (!SEASON_REGEX.test(raw)) throw new Error(`Invalid season format: ${raw}`);
  const [start, end] = raw.split('-').map(Number);
  if (end !== start + 1) throw new Error(`Invalid season range: ${raw}`);
  return raw as Season;
};
