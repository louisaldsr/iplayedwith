import fs from 'node:fs'
import path from 'node:path'

/**
 * The network half of `fame:exposure`: Wikidata queries and Wikipedia pageviews.
 *
 * Wikimedia rate-limits by how a client identifies itself (mediawiki.org, Wikimedia APIs/Rate
 * limits): an UNIDENTIFIED client gets 10 requests a minute, one whose User-Agent follows the
 * policy — `name/version (url; contact) library` — gets 200, the same as a new account with a
 * token. A first version without that format spent its time in 429s; with it, 26,731 calls went
 * through with 4 refusals. Paced here at ~165 a minute.
 */
const USER_AGENT = 'IPlayedWithFame/1.0 (https://github.com/louisaldsr) node-fetch'
const PAUSE_MS = 100
const MAX_TRIES = 8

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * GET as JSON, with Wikimedia's etiquette: paced, `Retry-After` honoured on a 429. A 404 is an
 * answer (`{}` — no data), a failure after every retry is NOT: it returns null, and the caller
 * leaves the value missing rather than reading 0.
 */
export async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    await sleep(PAUSE_MS)
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
      if (res.status === 404) return {} as T
      if (res.ok) return (await res.json()) as T
      const retryAfter = Number(res.headers.get('retry-after')) || Math.min(120, 5 * 2 ** attempt)
      if (res.status === 429) console.warn(`  HTTP 429, waiting ${retryAfter}s`)
      await sleep(retryAfter * 1000)
    } catch {
      await sleep(Math.min(120, 5 * 2 ** attempt) * 1000)
    }
  }
  return null
}

type SparqlResult = { results: { bindings: Record<string, { value: string }>[] } }

/** One SPARQL query on the Wikidata Query Service; throws when it never answers. */
export async function sparql(query: string): Promise<Record<string, string>[]> {
  const data = await getJson<SparqlResult>(
    `https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: 'json' })}`,
  )
  if (!data?.results) throw new Error('The Wikidata Query Service did not answer')
  return data.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])))
}

const qidOf = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1)

/** Every item carrying `property` (an external ID), by ID value: P9903 All.Rugby, P2446 Transfermarkt. */
export async function itemsByExternalId(property: string): Promise<Map<string, string[]>> {
  const rows = await sparql(`SELECT ?item ?id WHERE { ?item wdt:${property} ?id }`)
  const byId = new Map<string, string[]>()
  for (const r of rows) byId.set(r.id, [...(byId.get(r.id) ?? []), qidOf(r.item)])
  return byId
}

/**
 * Players of a sport (occupation `occupation`) with a French or English article but NO value for
 * `property`, by label — the candidates of the name fallback.
 */
export async function itemsWithoutIdByName(occupation: string, property: string): Promise<Map<string, string[]>> {
  const rows = await sparql(`SELECT ?item ?label WHERE {
    ?item wdt:P106 wd:${occupation} .
    FILTER NOT EXISTS { ?item wdt:${property} ?x }
    FILTER EXISTS { ?article schema:about ?item ;
                    schema:isPartOf ?wiki . VALUES ?wiki { <https://fr.wikipedia.org/> <https://en.wikipedia.org/> } }
    ?item rdfs:label ?label . FILTER(LANG(?label) IN ("fr", "en"))
  }`)
  const byName = new Map<string, string[]>()
  for (const r of rows) {
    const qids = byName.get(r.label) ?? []
    if (!qids.includes(qidOf(r.item))) byName.set(r.label, [...qids, qidOf(r.item)])
  }
  return byName
}

/** The French and English article titles of each item, 50 items per call. */
export async function articleTitles(qids: string[]): Promise<Map<string, Map<string, string>>> {
  type Entities = { entities?: Record<string, { sitelinks?: Record<string, { title: string }> }> }
  const titles = new Map<string, Map<string, string>>()
  for (let i = 0; i < qids.length; i += 50) {
    const data = await getJson<Entities>(
      `https://www.wikidata.org/w/api.php?${new URLSearchParams({
        action: 'wbgetentities',
        ids: qids.slice(i, i + 50).join('|'),
        props: 'sitelinks',
        sitefilter: 'frwiki|enwiki',
        format: 'json',
      })}`,
    )
    if (!data) throw new Error(`Wikidata did not answer for items ${i}..${i + 49}`)
    for (const [qid, entity] of Object.entries(data.entities ?? {})) {
      const byLang = new Map<string, string>()
      for (const lang of ['fr', 'en']) {
        const link = entity.sitelinks?.[`${lang}wiki`]
        if (link) byLang.set(lang, link.title)
      }
      titles.set(qid, byLang)
    }
  }
  return titles
}

/**
 * Monthly user views of every (language, title) over the window, summed, from a cache that
 * makes a run resumable — each answer is appended as soon as it arrives, so a stopped run picks
 * up where it was. A title whose calls all failed is absent from the result, never 0.
 */
export async function pageviews(
  jobs: { lang: string; title: string }[],
  window: { start: string; end: string; label: string },
  cacheDir: string,
): Promise<Map<string, number>> {
  fs.mkdirSync(cacheDir, { recursive: true })
  const cachePath = path.join(cacheDir, `pageviews-${window.label}.jsonl`)
  const key = (lang: string, title: string) => `${lang}|${title}`
  const done = new Map<string, number>()
  if (fs.existsSync(cachePath)) {
    for (const line of fs.readFileSync(cachePath, 'utf8').split('\n')) {
      if (!line) continue
      const r = JSON.parse(line) as { lang: string; title: string; views: number }
      done.set(key(r.lang, r.title), r.views)
    }
  }

  const todo = jobs.filter((j) => !done.has(key(j.lang, j.title)))
  console.log(`Pageviews: ${done.size} cached, ${todo.length} to fetch (~${Math.ceil(todo.length / 150)} min).`)
  const out = fs.openSync(cachePath, 'a')
  try {
    for (const [n, job] of todo.entries()) {
      const title = encodeURIComponent(job.title.replace(/ /g, '_'))
      const data = await getJson<{ items?: { views: number }[] }>(
        `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${job.lang}.wikipedia/all-access/user/` +
          `${title}/monthly/${window.start}/${window.end}`,
      )
      if (data) {
        const views = (data.items ?? []).reduce((sum, item) => sum + item.views, 0)
        done.set(key(job.lang, job.title), views)
        fs.writeSync(out, JSON.stringify({ lang: job.lang, title: job.title, views }) + '\n')
      }
      if (n % 1000 === 0 && n > 0) console.log(`  ${n}/${todo.length}`)
    }
  } finally {
    fs.closeSync(out)
  }
  return done
}
