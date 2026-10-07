import { saveJson } from '../common/json'
import { buildDataset, firstEndYear, lastEndYear, type SeasonPages } from './lib/dataset'
import { readCachedPage, teamPage, totalsPage } from './lib/pages'
import { parseTeamPage, type TeamSeasonPage } from './lib/rosterParser'
import { DATASET_PATH } from './lib/seed'
import { parseTotalsPage } from './lib/totalsParser'

/**
 * Step 2 of the basketball pipeline: parses the cached pages into
 * `scripts/output/basketball-dataset.json`. Reads the cache only — no network.
 */
function main() {
  const seasons: SeasonPages[] = []

  for (let endYear = firstEndYear(); endYear <= lastEndYear(); endYear++) {
    const totals = parseTotalsPage(readCachedPage(totalsPage(endYear)))
    const teams = new Map<string, TeamSeasonPage>()
    for (const abbr of new Set(totals.map((row) => row.teamAbbr))) {
      teams.set(abbr, parseTeamPage(readCachedPage(teamPage(abbr, endYear))))
    }
    seasons.push({ endYear, totals, teams })
  }

  const { dataset, warnings } = buildDataset(seasons)
  for (const w of warnings) console.warn(`${w.kind}: ${w.detail}`)

  saveJson(DATASET_PATH, dataset)

  const withNationality = dataset.players.filter((p) => p.nationality).length
  const seasonsSeen = [...new Set(dataset.memberships.map((m) => m.season))].sort()
  console.log(
    `\nDone. clubs=${dataset.clubs.length} players=${dataset.players.length} ` +
      `memberships=${dataset.memberships.length} seasons=${seasonsSeen[0]}..${seasonsSeen[seasonsSeen.length - 1]} ` +
      `nationality=${withNationality}/${dataset.players.length}`,
  )
  console.log(`Dataset written to ${DATASET_PATH}`)
}

main()
