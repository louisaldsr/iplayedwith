/**
 * TypeScript mirror of the SQL `public.search_normalize()` from
 * supabase/migrations/008_search_normalization.sql. The two must agree: the server
 * normalizes names into `players.search_name` / `clubs.search_name`, and the browser uses
 * this to decide whether what was typed matches a suggestion that came back.
 *
 * The rule: lowercase, strip diacritics, then drop every non-alphanumeric character —
 * spaces included. Dropping separators rather than collapsing them to a space is what
 * makes "saint etienne", "saint-etienne" and "saintetienne" one string, and what lets
 * "oconnor" find "O'Connor".
 *
 * Not the same as `normalize()` in scripts/common/textNormalize.ts, which keeps spaces
 * because the import-time club matcher works on tokens. Both exist on purpose.
 */

const COMBINING_DIACRITICS = /[̀-ͯ]/g
const NON_ALPHANUMERIC = /[^a-z0-9]+/g

/**
 * Characters NFD leaves alone because they are letters in their own right, not a base
 * plus an accent. Postgres' `unaccent` dictionary folds them, so without this table the
 * two implementations would disagree on names the football dataset is full of —
 * Ødegaard, Håland's teammates, Łukasz, Weiß.
 */
const LETTER_FOLDS: Record<string, string> = {
  ø: 'o', Ø: 'o',
  æ: 'ae', Æ: 'ae',
  œ: 'oe', Œ: 'oe',
  ß: 'ss',
  ł: 'l', Ł: 'l',
  đ: 'd', Đ: 'd',
  ð: 'd', Ð: 'd',
  þ: 'th', Þ: 'th',
  ħ: 'h', Ħ: 'h',
  ŧ: 't', Ŧ: 't',
  ı: 'i',
}

const FOLDABLE = new RegExp(`[${Object.keys(LETTER_FOLDS).join('')}]`, 'g')

/** Folds a name (or a search query) to its comparable form. */
export function normalizeSearch(raw: string): string {
  return raw
    .replace(FOLDABLE, (c) => LETTER_FOLDS[c])
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, '')
}

/** Whether two names are the same once normalized — the typed-vs-suggestion comparison. */
export function searchEquals(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return normalizeSearch(a) === normalizeSearch(b)
}
