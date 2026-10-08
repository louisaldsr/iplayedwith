import fs from 'node:fs'
import { fetchWithCache } from '../../common/fetchWithCache'
import { inputPath } from '../../common/paths'

/**
 * The Jolpica-F1 pages the import reads (the Ergast API's successor, same JSON), and where each is
 * cached — `scripts/input/formula1/`.
 */
const BASE_URL = 'https://api.jolpi.ca/ergast/f1'

/** Jolpica's page size cap. */
export const PAGE_SIZE = 100

/**
 * Jolpica allows 4 requests a second and 500 an hour, and warns both will go down. 8 s keeps a live
 * run at 450 an hour. Cache hits skip the pause, so only the first run is slow (~45 min).
 */
const LIVE_FETCH_DELAY_MS = 8000

export type PageRef = { url: string; cachePath: string }

/** One page of a season's race results: every driver who started, one row per race. */
export function resultsPage(year: number, offset: number): PageRef {
  return {
    url: `${BASE_URL}/${year}/results/?limit=${PAGE_SIZE}&offset=${offset}`,
    cachePath: inputPath('formula1', 'results', `${year}-${offset}.json`),
  }
}

/** A season's final constructors' standings — the championship exists from 1958. */
export function constructorStandingsPage(year: number): PageRef {
  return {
    url: `${BASE_URL}/${year}/constructorstandings/?limit=${PAGE_SIZE}`,
    cachePath: inputPath('formula1', 'constructor-standings', `${year}.json`),
  }
}

export function isCached(page: PageRef): boolean {
  return fs.existsSync(page.cachePath)
}

/**
 * Live fetch with the throttle, or the cached copy. Any non-2xx — a 429 above all — throws, and
 * the caller lets it end the run: a re-run resumes from the cache.
 */
export function fetchPage(page: PageRef): Promise<string> {
  return fetchWithCache(page.url, page.cachePath, LIVE_FETCH_DELAY_MS)
}

/** The cached copy only — the build step never touches the network. */
export function readCachedPage(page: PageRef): string {
  if (!isCached(page)) {
    throw new Error(`Missing ${page.cachePath} — run "npm run seed:formula1:fetch" first.`)
  }
  return fs.readFileSync(page.cachePath, 'utf8')
}
