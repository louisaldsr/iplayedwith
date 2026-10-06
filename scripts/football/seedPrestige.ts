import { computeFameScores } from '@/services/fameService'
import { importClubTitles, importContinentalWins } from '@/services/prestigeService'
import { ServiceError } from '@/services/errors'
import { getDb } from '../common/env'
import { collectContinentalRuns, deriveTitles } from './lib/prestige'
import { CLUBS_SEEDED_PATH, loadSeededIds } from './lib/seed'
import { streamGameResults, type GameResult } from './lib/transfermarktDataset'

/** Owner of the derived titles in `club_titles`: a re-run replaces exactly these rows. */
const TITLES_SOURCE = 'transfermarkt'

/**
 * Step 6 of the football pipeline: writes each club-season's continental run (its wins) and the
 * titles derived from the results, then recomputes the sport — season prestige, then fame, which reads it.
 *
 * Runs after `:memberships` (the DB keeps only the club-seasons the graph has) and replaces
 * `:fame` as the last step: fame is recomputed here. Reads `games.csv` directly, like
 * `:build`, so `npm run seed:football:fetch` must have run.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const clubIds = loadSeededIds(CLUBS_SEEDED_PATH)
  if (Object.keys(clubIds).length === 0) {
    throw new Error(`No clubs in ${CLUBS_SEEDED_PATH} — run "npm run seed:football:clubs" first.`)
  }
  const inScope = (transfermarktId: string) => transfermarktId in clubIds

  const games: GameResult[] = []
  await streamGameResults((game) => games.push(game))
  console.log(`${games.length} games read.`)

  const runs = collectContinentalRuns(games, inScope)
  const { titles, warnings } = deriveTitles(games, inScope)

  for (const w of warnings) console.warn(`  ⚠ ${w.kind}: ${w.detail}`)
  const byCompetition = new Map<string, number>()
  for (const t of titles) byCompetition.set(t.competition, (byCompetition.get(t.competition) ?? 0) + 1)
  console.log(`${runs.length} club-seasons with a continental run.`)
  console.log(
    `${titles.length} titles derived: ${[...byCompetition].map(([c, n]) => `${c} ${n}`).join(', ') || 'none'}.`,
  )

  if (dryRun) {
    console.log('Done (dry run, no DB writes).')
    return
  }

  try {
    const db = getDb()
    const { written: runsWritten } = await importContinentalWins(
      db,
      'football',
      runs.map((run) => ({ clubId: clubIds[run.clubId], season: run.season, wins: run.wins })),
    )
    const { written: titlesWritten } = await importClubTitles(
      db,
      'football',
      TITLES_SOURCE,
      titles.map((title) => ({ clubId: clubIds[title.clubId], season: title.season, competition: title.competition })),
    )
    // Scored right away: the signals just moved. compute_fame_scores rescores prestige first.
    const { scored } = await computeFameScores(db, 'football')
    console.log(
      `Done. runs written=${runsWritten}/${runs.length} (the rest have no membership), ` +
        `titles written=${titlesWritten}/${titles.length}, players scored=${scored}`,
    )
  } catch (err) {
    throw new Error(`Failed to import prestige: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
