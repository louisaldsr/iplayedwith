import { firstEndYear, lastEndYear } from './lib/dataset'
import { fetchPage, isCached, teamPage, totalsPage, type PageRef } from './lib/pages'
import { parseTotalsPage } from './lib/totalsParser'

/**
 * Step 1 of the basketball pipeline: caches every page the build step reads, under
 * `scripts/input/basketball/`. A season's totals page comes first because it names the teams
 * whose pages are needed for that season.
 *
 * About 1,350 pages at the polite rate is ~80 minutes the first time. A re-run only fetches what
 * is missing, so an interrupted run — or one stopped by a 429 — resumes where it left off.
 */
async function main() {
  let live = 0
  let cached = 0
  const get = async (page: PageRef) => {
    if (isCached(page)) cached++
    else live++
    return fetchPage(page)
  }

  for (let endYear = firstEndYear(); endYear <= lastEndYear(); endYear++) {
    const totals = parseTotalsPage(await get(totalsPage(endYear)))
    const teams = [...new Set(totals.map((row) => row.teamAbbr))].sort()
    if (teams.length === 0) throw new Error(`NBA_${endYear}: no team rows — has the page layout changed?`)

    for (const team of teams) await get(teamPage(team, endYear))
    console.log(
      `${endYear - 1}-${endYear}: ${totals.length} rows, ${teams.length} teams (live=${live} cached=${cached})`,
    )
  }

  console.log(`\nDone. live=${live} cached=${cached}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
