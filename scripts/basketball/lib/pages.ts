import fs from 'node:fs'
import { fetchWithCache } from '../../common/fetchWithCache'
import { inputPath } from '../../common/paths'

/**
 * The two Basketball-Reference page types the import reads, and where each is cached.
 *
 * Basketball-Reference names a season by the year it ENDS in: `NBA_1980` and `/teams/BOS/1980`
 * are the 1979-80 season. Everything in this module speaks in those end years; `dataset.ts` is
 * where they become a `Season`.
 */
const BASE_URL = 'https://www.basketball-reference.com'

/**
 * Sports-Reference allows 20 requests a minute and blocks the IP for an hour beyond that. 3.5 s
 * keeps a live run at ~17 a minute. Cache hits skip the pause, so only the first run is slow.
 */
const LIVE_FETCH_DELAY_MS = 3500

export type PageRef = { url: string; cachePath: string }

/** Every player who played that season, one row per (player, team), regular season and playoffs. */
export function totalsPage(endYear: number): PageRef {
  return {
    url: `${BASE_URL}/leagues/NBA_${endYear}_totals.html`,
    cachePath: inputPath('basketball', 'leagues', `NBA_${endYear}_totals.html`),
  }
}

/** One team's season: its name as it was that year, its logo, and the roster with birth countries. */
export function teamPage(teamAbbr: string, endYear: number): PageRef {
  return {
    url: `${BASE_URL}/teams/${teamAbbr}/${endYear}.html`,
    cachePath: inputPath('basketball', 'teams', teamAbbr, `${endYear}.html`),
  }
}

export function isCached(page: PageRef): boolean {
  return fs.existsSync(page.cachePath)
}

/**
 * Live fetch with the throttle, or the cached copy. Any non-2xx — a 429 above all — throws, and
 * the caller lets it end the run: retrying into a rate limit is what turns it into an hour's ban.
 */
export function fetchPage(page: PageRef): Promise<string> {
  return fetchWithCache(page.url, page.cachePath, LIVE_FETCH_DELAY_MS)
}

/** The cached copy only — the build step never touches the network. */
export function readCachedPage(page: PageRef): string {
  if (!isCached(page)) {
    throw new Error(`Missing ${page.cachePath} — run "npm run seed:basketball:fetch" first.`)
  }
  return fs.readFileSync(page.cachePath, 'utf8')
}
