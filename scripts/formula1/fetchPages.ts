import { FIRST_YEAR, FIRST_CONSTRUCTORS_YEAR, lastYear } from './lib/dataset'
import { constructorStandingsPage, fetchPage, isCached, PAGE_SIZE, resultsPage, type PageRef } from './lib/pages'

/**
 * Step 1 of the Formula 1 pipeline: caches every Jolpica page the build step reads, under
 * `scripts/input/formula1/` — each season's race results (paged, ~280 pages) and its final
 * constructors' standings (from 1958, ~70). ~45 min the first time at Jolpica's rate limit.
 *
 * A re-run only fetches what is missing, so an interrupted run — or one stopped by a 429 — resumes
 * where it left off.
 */
async function main() {
  let live = 0
  let cached = 0
  const get = async (page: PageRef) => {
    if (isCached(page)) cached++
    else live++
    return JSON.parse(await fetchPage(page)) as { MRData: { total: string } }
  }

  for (let year = FIRST_YEAR; year <= lastYear(); year++) {
    const first = await get(resultsPage(year, 0))
    const total = Number(first.MRData.total)
    if (!(total > 0)) throw new Error(`${year}: no results — has the API changed?`)
    for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) await get(resultsPage(year, offset))
    if (year >= FIRST_CONSTRUCTORS_YEAR) await get(constructorStandingsPage(year))
    console.log(`${year}: ${total} results (live=${live} cached=${cached})`)
  }

  console.log(`\nDone. live=${live} cached=${cached}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
