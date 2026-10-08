import { saveJson } from '../common/json'
import {
  buildDataset,
  FIRST_CONSTRUCTORS_YEAR,
  FIRST_YEAR,
  lastYear,
  type ConstructorStandingsPage,
  type ResultsPage,
  type SeasonPages,
} from './lib/dataset'
import { constructorStandingsPage, PAGE_SIZE, readCachedPage, resultsPage } from './lib/pages'
import { DATASET_PATH } from './lib/seed'

/**
 * Step 2 of the Formula 1 pipeline: parses the cached Jolpica pages into
 * `scripts/output/formula1-dataset.json`. Reads the cache only — no network.
 */
function main() {
  const seasons: SeasonPages[] = []

  for (let year = FIRST_YEAR; year <= lastYear(); year++) {
    const first = JSON.parse(readCachedPage(resultsPage(year, 0))) as ResultsPage
    const results = [first]
    for (let offset = PAGE_SIZE; offset < Number(first.MRData.total); offset += PAGE_SIZE) {
      results.push(JSON.parse(readCachedPage(resultsPage(year, offset))) as ResultsPage)
    }
    const standings =
      year >= FIRST_CONSTRUCTORS_YEAR
        ? (JSON.parse(readCachedPage(constructorStandingsPage(year))) as ConstructorStandingsPage)
        : null
    seasons.push({ year, results, standings })
  }

  const { dataset, warnings } = buildDataset(seasons)
  for (const w of warnings) console.warn(`${w.kind}: ${w.detail}`)

  saveJson(DATASET_PATH, dataset)

  const share = (n: number, of: number) => `${n}/${of} (${((100 * n) / Math.max(of, 1)).toFixed(1)}%)`
  const seasonsSeen = [...new Set(dataset.memberships.map((m) => m.season))].sort()
  const p = dataset.players
  console.log(
    `\nDone. clubs=${dataset.clubs.length} drivers=${p.length} memberships=${dataset.memberships.length} ` +
      `seasons=${seasonsSeen[0]}..${seasonsSeen[seasonsSeen.length - 1]}`,
  )
  console.log(
    `nationality ${share(p.filter((x) => x.nationality).length, p.length)}, ` +
      `Wikipedia title ${share(p.filter((x) => x.enwikiTitle).length, p.length)}, ` +
      `on a podium ${p.filter((x) => x.podiumsScaled > 0).length}`,
  )
  const cs = dataset.constructorSeasons
  console.log(
    `memberships without a start ${dataset.memberships.filter((m) => m.starts === 0).length}; ` +
      `constructor-seasons with a win ${cs.filter((c) => c.wins > 0).length}, titles ${cs.filter((c) => c.champion).length}`,
  )
  console.log(`Dataset written to ${DATASET_PATH}`)
}

main()
