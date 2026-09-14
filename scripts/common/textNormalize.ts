const COMBINING_DIACRITICS = /[̀-ͯ]/g

/** Lowercases, strips accents, and collapses to single spaces — for loose text matching. */
export function normalize(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
