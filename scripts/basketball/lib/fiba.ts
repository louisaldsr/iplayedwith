import fs from 'node:fs'
import path from 'node:path'
import * as cheerio from 'cheerio'
import { loadJson, saveJson } from '../../common/json'
import { inputPath } from '../../common/paths'
import type { PageRef } from './pages'

/**
 * International caps for basketball: the senior national-team games FIBA lists on each player's
 * page (Olympics, World Cups, continental championships and their qualifiers).
 *
 * Basketball-Reference has no international data, so the two are joined through Wikidata, which
 * holds both ids on the same item: P2685 (Basketball-Reference, "j/jordami01") and P12338
 * (FIBA.basketball person id). An exact join, never a guess between homonyms — the same stance as
 * `fame:exposure`. Measured on the 1979-2026 dataset: 90% of players have a FIBA id, 99% of the
 * non-US ones; most of the rest are Americans who never played for their country.
 */

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'
const WIKIDATA_USER_AGENT = 'iplayedwith-seed-script/1.0 (https://iplayedwith.com)'
const FIBA_USER_AGENT = 'Mozilla/5.0 (compatible; iplayedwith-seed-script/1.0)'

/** One query for every pair: ~5,200 rows. */
const FIBA_IDS_QUERY = 'SELECT ?br ?fiba WHERE { ?p wdt:P2685 ?br . ?p wdt:P12338 ?fiba . }'

/** Basketball-Reference slug → FIBA person ids. Usually one; FIBA holds duplicates for ~60 players. */
export type FibaIdMap = Record<string, string[]>

const FIBA_IDS_PATH = inputPath('basketball', 'wikidata-fiba-ids.json')

/**
 * FIBA's CDN keeps a player page for 12 hours, but a page nobody asked for recently is COLD: the
 * first request gets a 200 with the generic FIBA home page while the page renders, and the same
 * request ~10 s later gets the real one (measured on never-fetched ids). So each page is WARMED —
 * requested once, the answer thrown away — `WARM_AHEAD` pages before it is fetched for real.
 *
 * A real player page is titled "<Name> (<Country>) - Basketball Stats, Height, Age | …"; anything
 * else is never cached.
 */
const PLAYER_PAGE_TITLE = /<title>[^<]*Basketball Stats/

/** FIBA's not-found page, served with a 200 for an id it has merged away (measured: 341113). */
const NOT_FOUND_TITLE = /<title>\s*Page Not Found/

/** One request a second, warm-ups included: two requests a page, ~2 h for the ~3,500 pages. */
const REQUEST_GAP_MS = 1000

/** Pages warmed ahead of the one fetched: 6 × 2 requests × 1 s ≈ 12 s of warm-up per page. */
const WARM_AHEAD = 6

/** Waits after a page still generic once warm: 15 s, then 30, 60, 120, 240 — then the run stops. */
const BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 240_000]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The Basketball-Reference → FIBA id map, from Wikidata. Cached: a re-run of the fetch never asks
 * again — delete the file to refresh it.
 */
export async function loadFibaIds(): Promise<FibaIdMap> {
  const cached = loadJson<FibaIdMap | null>(FIBA_IDS_PATH, null)
  if (cached) return cached

  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(FIBA_IDS_QUERY)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': WIKIDATA_USER_AGENT },
  })
  if (!res.ok) throw new Error(`Wikidata query failed (${res.status})`)
  const body = (await res.json()) as { results: { bindings: { br: { value: string }; fiba: { value: string } }[] } }

  const ids: FibaIdMap = {}
  for (const { br, fiba } of body.results.bindings) {
    // Wikidata keeps the site's letter folder: "j/jordami01".
    const slug = br.value.split('/').pop()!
    ids[slug] = [...new Set([...(ids[slug] ?? []), fiba.value])].sort()
  }
  saveJson(FIBA_IDS_PATH, ids)
  return ids
}

/** The cached map only — the build step never touches the network. */
export function readFibaIds(): FibaIdMap {
  const ids = loadJson<FibaIdMap | null>(FIBA_IDS_PATH, null)
  if (!ids) throw new Error(`Missing ${FIBA_IDS_PATH} — run "npm run seed:basketball:fetch" first.`)
  return ids
}

export function fibaPage(fibaId: string): PageRef {
  return {
    // The slug after the id is cosmetic: the bare id redirects to the canonical page.
    url: `https://www.fiba.basketball/en/players/${fibaId}`,
    cachePath: inputPath('basketball', 'fiba', `${fibaId}.html`),
  }
}

/** Cached in place of a page FIBA no longer has: a stale Wikidata id reads as "no senior events". */
const NOT_FOUND_MARKER = '<!-- FIBA 404 -->'

const requestPage = (page: PageRef) =>
  fetch(page.url, { headers: { 'User-Agent': FIBA_USER_AGENT, 'Accept-Language': 'en' } })

/** Asks for a page so FIBA starts rendering it; the answer is not used. */
async function warmFibaPage(page: PageRef): Promise<void> {
  try {
    const res = await requestPage(page)
    await res.arrayBuffer()
    if (res.status === 429) throw new Error(`Fetch failed (429) for ${page.url}`)
  } catch (err) {
    // Best effort: a dropped connection only means this page is fetched cold, and retried.
    if (err instanceof Error && err.message.startsWith('Fetch failed (429)')) throw err
  }
  await sleep(REQUEST_GAP_MS)
}

/**
 * The cached page, or a live fetch that is only cached once it is checked to BE a player page: a
 * page still generic backs off and retries (see `BACKOFF_MS`), and is never written to the cache.
 *
 * A 404 — or FIBA's "Page Not Found" served with a 200 — is cached as a marker instead of ending the run: Wikidata can hold an id FIBA has since
 * merged or removed, and one such id must not stop 3,500 fetches. Any other failure — a 429 above
 * all — throws.
 */
export async function fetchFibaPage(page: PageRef): Promise<string> {
  const cached = readCachedFibaPage(page)
  if (cached !== null) return cached

  for (let attempt = 0; ; attempt++) {
    // A dropped connection (measured: one after 166 pages) is retried like a generic page.
    let html: string | null = null
    try {
      const res = await requestPage(page)
      html = res.status === 404 ? NOT_FOUND_MARKER : await res.text()
      if (NOT_FOUND_TITLE.test(html)) html = NOT_FOUND_MARKER
      if (res.status !== 404 && !res.ok) throw new Error(`Fetch failed (${res.status}) for ${page.url}`)
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Fetch failed')) throw err
      console.warn(`  network error on ${page.url}: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (html !== null && (html === NOT_FOUND_MARKER || PLAYER_PAGE_TITLE.test(html))) {
      fs.mkdirSync(path.dirname(page.cachePath), { recursive: true })
      fs.writeFileSync(page.cachePath, html, 'utf8')
      await sleep(REQUEST_GAP_MS)
      return html
    }

    if (attempt >= BACKOFF_MS.length) {
      throw new Error(
        `FIBA: no player page for ${page.url} after ${BACKOFF_MS.length} retries — stopped; re-run later to resume.`,
      )
    }
    if (html !== null) console.warn(`  FIBA page still generic: ${page.url}`)
    console.warn(`  waiting ${BACKOFF_MS[attempt] / 1000} s`)
    await sleep(BACKOFF_MS[attempt])
  }
}

/**
 * Fetches `pages` in order, each warmed `WARM_AHEAD` pages earlier. Cached pages cost nothing.
 *
 * A page that exhausts its retries is skipped, not cached, and returned: one outage (measured: ~8
 * minutes of dropped connections after 2,900 pages) must not end a four-hour run. A re-run fetches
 * the skipped ones; until then the build counts their players' caps as unknown. A 429 still stops.
 */
export async function fetchFibaPages(pages: PageRef[], onFetched: (index: number) => void): Promise<PageRef[]> {
  const pending = pages.filter((page) => readCachedFibaPage(page) === null)
  const skipped: PageRef[] = []
  for (const page of pending.slice(0, WARM_AHEAD)) await warmFibaPage(page)
  for (const [i, page] of pending.entries()) {
    const ahead = pending[i + WARM_AHEAD]
    if (ahead) await warmFibaPage(ahead)
    try {
      await fetchFibaPage(page)
    } catch (err) {
      if (!(err instanceof Error) || !err.message.startsWith('FIBA: no player page')) throw err
      console.warn(`  skipped: ${err.message}`)
      skipped.push(page)
    }
    onFetched(i)
  }
  return skipped
}

export function readCachedFibaPage(page: PageRef): string | null {
  return fs.existsSync(page.cachePath) ? fs.readFileSync(page.cachePath, 'utf8') : null
}

/** One senior national-team event and the games played in it. */
export type FibaSeniorEvent = { year: number; event: string; games: number }

export type FibaPlayerPage = {
  /** The nation in the page title, "Tony Parker (France)" — FIBA's sporting nation. Null when blank. */
  titleCountry: string | null
  /** The FIBA codes in the page's `nationality` field ("FRA", or "USA, ITA" for a dual national). */
  nationalityCodes: string[]
  seniorEvents: FibaSeniorEvent[]
}

/**
 * Reads a FIBA player page: the senior national-team table (youth teams are a separate table, and
 * are not caps) and the two places the page names the player's nation.
 */
export function parseFibaPlayerPage(html: string): FibaPlayerPage {
  const $ = cheerio.load(html)

  const titleCountry =
    $('title')
      .first()
      .text()
      .match(/\(([^)]+)\)/)?.[1]
      ?.trim() || null
  const rawCodes = html.replace(/\\"/g, '"').match(/"nationality":"([^"]*)"/)?.[1] ?? ''
  const nationalityCodes = rawCodes
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)

  const seniorEvents: FibaSeniorEvent[] = []
  $('[data-testid="player-career-stats-national-senior"] table tbody tr').each((_, tr) => {
    const cells = $(tr).find('td')
    const year = Number(cells.eq(0).text().trim())
    const event = cells.eq(1).text().trim()
    const gamesText = cells.eq(2).text().trim()
    if (!Number.isInteger(year) || !event) return
    if (!/^\d+$/.test(gamesText)) throw new Error(`FIBA senior row "${year} ${event}": unreadable GP "${gamesText}"`)
    seniorEvents.push({ year, event, games: Number(gamesText) })
  })

  return { titleCountry, nationalityCodes, seniorEvents }
}

/** One nation of the FIBA men's world ranking. */
export type FibaRankedNation = { fibaCode: string; countryName: string; worldRank: number }

/** The key of caps whose nation could not be told: weighted as a minor nation's, like football's. */
export const UNKNOWN_NATION = 'unknown'

/**
 * A player's caps, keyed by the FIBA code of the nation they played for — the key the basketball
 * `nation_tiers` rows use.
 *
 * The nation is the page title's country, resolved to its code through the ranking; failing that,
 * the `nationality` field when it names a single nation. A dual national with no title country is
 * `UNKNOWN_NATION` rather than a guess. FIBA keeps duplicates for ~60 players, so the same event
 * listed on two of their pages counts once.
 */
export function capsByNation(pages: FibaPlayerPage[], ranking: FibaRankedNation[]): Record<string, number> {
  const seen = new Set<string>()
  let games = 0
  for (const event of pages.flatMap((page) => page.seniorEvents)) {
    const key = `${event.year}||${event.event}`
    if (seen.has(key)) continue
    seen.add(key)
    games += event.games
  }
  if (games === 0) return {}

  const codeByName = new Map(ranking.map((nation) => [nation.countryName, nation.fibaCode]))
  const fromTitle = pages.map((page) => page.titleCountry && codeByName.get(page.titleCountry)).find(Boolean)
  const codes = [...new Set(pages.flatMap((page) => page.nationalityCodes))]
  const nation = fromTitle ?? (codes.length === 1 ? codes[0] : UNKNOWN_NATION)
  return { [nation]: games }
}

export const fibaRankingPage = (): PageRef => ({
  url: 'https://www.fiba.basketball/en/ranking/men',
  cachePath: inputPath('basketball', 'fiba-ranking-men.html'),
})

/** The ranking page, warmed then checked like a player page. A snapshot: delete the file to refresh it. */
export async function fetchFibaRanking(): Promise<string> {
  const page = fibaRankingPage()
  const cached = readCachedFibaPage(page)
  if (cached !== null) return cached

  await warmFibaPage(page)
  await sleep(10_000)
  const res = await requestPage(page)
  const html = await res.text()
  if (!res.ok || !/<title>[^<]*World Ranking/.test(html)) {
    throw new Error(`FIBA ranking: no ranking page (${res.status}) — re-run later.`)
  }
  fs.mkdirSync(path.dirname(page.cachePath), { recursive: true })
  fs.writeFileSync(page.cachePath, html, 'utf8')
  return html
}

/** The ranked nations, from the data the ranking page embeds. */
export function parseFibaRanking(html: string): FibaRankedNation[] {
  const data = html.replace(/\\"/g, '"')
  const nations = new Map<string, FibaRankedNation>()
  for (const [, worldRank, countryName, fibaCode] of data.matchAll(
    /\{"worldRank":(\d+),"countryName":"([^"]+)","zoneRank":[^,]*,"iocCode":"[^"]*","fibaCode":"([A-Z]+)"/g,
  )) {
    nations.set(fibaCode, { fibaCode, countryName: JSON.parse(`"${countryName}"`), worldRank: Number(worldRank) })
  }
  if (nations.size < 100) throw new Error(`FIBA ranking: only ${nations.size} nations read — has the page changed?`)
  return [...nations.values()].sort((a, b) => a.worldRank - b.worldRank)
}
