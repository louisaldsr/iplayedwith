import { firstEndYear, lastEndYear } from './lib/dataset'
import { fetchFibaPages, fetchFibaRanking, fibaPage, loadFibaIds } from './lib/fiba'
import { fetchPage, isCached, teamPage, totalsPage, type PageRef } from './lib/pages'
import { parseTotalsPage } from './lib/totalsParser'

/**
 * Step 1 of the basketball pipeline: caches every page the build step reads, under
 * `scripts/input/basketball/`.
 *
 * 1. Basketball-Reference: each season's totals page, then the team pages it names (~1,360
 *    pages, ~1 h 40 the first time at the site's rate limit).
 * 2. FIBA: the men's world ranking, the Wikidata id map, then the FIBA page of every dataset player who has one (~3,500
 *    pages, ~2 h: each one warmed first, see lib/fiba.ts) — the international caps.
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
    return fetchPage(page)
  }

  const playerIds = new Set<string>()
  for (let endYear = firstEndYear(); endYear <= lastEndYear(); endYear++) {
    const totals = parseTotalsPage(await get(totalsPage(endYear)))
    const teams = [...new Set(totals.map((row) => row.teamAbbr))].sort()
    if (teams.length === 0) throw new Error(`NBA_${endYear}: no team rows — has the page layout changed?`)
    for (const row of totals) playerIds.add(row.playerId)

    for (const team of teams) await get(teamPage(team, endYear))
    console.log(
      `${endYear - 1}-${endYear}: ${totals.length} rows, ${teams.length} teams (live=${live} cached=${cached})`,
    )
  }

  await fetchFibaRanking()
  const fibaIds = await loadFibaIds()
  const pages = [...playerIds]
    .sort()
    .flatMap((id) => fibaIds[id] ?? [])
    .map(fibaPage)
  const fibaPending = pages.filter((page) => !isCached(page)).length
  console.log(`\nFIBA: ${pages.length} pages, ${fibaPending} to fetch`)
  const skipped = await fetchFibaPages(pages, (i) => {
    live++
    if ((i + 1) % 100 === 0) console.log(`  ... ${i + 1}/${fibaPending}`)
  })
  if (skipped.length > 0) {
    console.error(`\n${skipped.length} FIBA page(s) skipped after retries — re-run to fetch them:`)
    for (const page of skipped) console.error(`  ${page.url}`)
    process.exitCode = 1
  }

  console.log(`\nDone. live=${live} cached=${cached}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
