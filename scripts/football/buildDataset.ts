import path from 'node:path'
import { saveJson } from '../common/json'
import { outputPath } from '../common/paths'
import {
  BIG5_LEAGUES,
  buildDataset,
  createMembershipCollector,
  indexGames,
  type BuildWarning,
} from './lib/dataset'
import {
  loadClubs,
  loadCompetitions,
  loadPlayers,
  streamAppearances,
  streamGames,
  type Game,
} from './lib/transfermarktDataset'

function reportWarnings(warnings: BuildWarning[]) {
  if (warnings.length === 0) return
  const byKind = new Map<BuildWarning['kind'], string[]>()
  for (const w of warnings) byKind.set(w.kind, [...(byKind.get(w.kind) ?? []), w.detail])

  for (const [kind, details] of byKind) {
    // Unmapped nationalities repeat once per player; the distinct country names are the
    // actionable part, so collapse them.
    const unique = [...new Set(details)]
    console.warn(`\n${kind}: ${details.length} occurrence(s), ${unique.length} distinct`)
    for (const detail of unique.slice(0, 60)) console.warn(`  - ${detail}`)
    if (unique.length > 60) console.warn(`  ... and ${unique.length - 60} more`)
  }
}

async function main() {
  const competitions = await loadCompetitions()
  for (const id of Object.keys(BIG5_LEAGUES)) {
    const competition = competitions.get(id)
    if (!competition) throw new Error(`Competition "${id}" is missing from competitions.csv`)
    if (competition.type !== 'domestic_league') {
      throw new Error(`Competition "${id}" is a ${competition.type}, expected domestic_league`)
    }
  }
  console.log(`Big 5 leagues resolved: ${Object.values(BIG5_LEAGUES).join(', ')}`)

  const games: Game[] = []
  await streamGames((game) => games.push(game))
  const index = indexGames(games)
  console.log(
    `Games: ${games.length} total, ${index.seasonByGameId.size} in scope seasons, ` +
      `${index.big5ClubIds.size} clubs with a Big-5 league game`,
  )

  const collector = createMembershipCollector(index)
  let appearances = 0
  await streamAppearances((appearance) => {
    appearances++
    collector.add(appearance)
  })
  const memberships = collector.result()
  console.log(`Appearances: ${appearances} read -> ${memberships.length} distinct (player, club, season) memberships`)

  const clubsById = await loadClubs()
  const playerIds = new Set(memberships.map((m) => m.playerTransfermarktId))
  const playersById = await loadPlayers((id) => playerIds.has(id))

  const { dataset, warnings } = buildDataset(memberships, clubsById, playersById)
  reportWarnings(warnings)

  const outPath = outputPath('football-dataset.json')
  saveJson(outPath, dataset)

  const seasons = [...new Set(dataset.memberships.map((m) => m.season))].sort()
  console.log(
    `\nDone. clubs=${dataset.clubs.length} players=${dataset.players.length} ` +
      `memberships=${dataset.memberships.length} seasons=${seasons[0]}..${seasons[seasons.length - 1]}`,
  )
  console.log(`Dataset written to ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
