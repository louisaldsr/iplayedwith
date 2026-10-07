import { saveJson } from '../common/json'
import { buildDataset, firstEndYear, lastEndYear, type SeasonPages } from './lib/dataset'
import {
  fibaPage,
  fibaRankingPage,
  parseFibaPlayerPage,
  parseFibaRanking,
  readCachedFibaPage,
  readFibaIds,
  type FibaPlayerPage,
} from './lib/fiba'
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

  // Caps: every FIBA page of every player, from the cache. A page the fetch has not reached yet
  // leaves that player's caps unknown rather than 0.
  const rankingHtml = readCachedFibaPage(fibaRankingPage())
  if (!rankingHtml) throw new Error('Missing the FIBA ranking — run "npm run seed:basketball:fetch" first.')
  const ranking = parseFibaRanking(rankingHtml)

  const fibaIds = readFibaIds()
  const fibaPages = new Map<string, FibaPlayerPage[]>()
  let missingPages = 0
  for (const playerId of new Set(seasons.flatMap((s) => s.totals.map((row) => row.playerId)))) {
    const pages = (fibaIds[playerId] ?? []).map((id) => readCachedFibaPage(fibaPage(id)))
    if (pages.length === 0) continue
    if (pages.some((html) => html === null)) {
      missingPages++
      continue
    }
    fibaPages.set(
      playerId,
      pages.map((html) => parseFibaPlayerPage(html!)),
    )
  }
  if (missingPages > 0) console.warn(`FIBA: ${missingPages} player(s) with pages not fetched yet — caps unknown.`)

  const { dataset, warnings } = buildDataset(seasons, fibaPages, ranking)
  for (const w of warnings) console.warn(`${w.kind}: ${w.detail}`)

  saveJson(DATASET_PATH, dataset)

  const withNationality = dataset.players.filter((p) => p.nationality).length
  const seasonsSeen = [...new Set(dataset.memberships.map((m) => m.season))].sort()
  console.log(
    `\nDone. clubs=${dataset.clubs.length} players=${dataset.players.length} ` +
      `memberships=${dataset.memberships.length} seasons=${seasonsSeen[0]}..${seasonsSeen[seasonsSeen.length - 1]} ` +
      `nationality=${withNationality}/${dataset.players.length}`,
  )
  const share = (n: number, of: number) => `${n}/${of} (${((100 * n) / Math.max(of, 1)).toFixed(1)}%)`
  const capsKnown = dataset.players.filter((p) => p.capsByNation !== null)
  const capped = capsKnown.filter((p) => Object.values(p.capsByNation!).some((n) => n > 0))
  console.log(`caps known ${share(capsKnown.length, dataset.players.length)}, capped ${capped.length}`)
  const m = dataset.memberships
  console.log(
    `starts ${share(m.filter((x) => x.starts !== null).length, m.length)}, ` +
      `minutes ${share(m.filter((x) => x.minutes !== null).length, m.length)}`,
  )
  console.log(
    `playoff club-seasons ${dataset.clubSeasons.length}, champions ${dataset.clubSeasons.filter((c) => c.champion).length}`,
  )
  console.log(`Dataset written to ${DATASET_PATH}`)
}

main()
