import { computeFameScores } from '@/services/fameService'
import { importClubTitles, importContinentalWins } from '@/services/prestigeService'
import { ServiceError } from '@/services/errors'
import { getDb } from '../common/env'
import { loadSeededIds, seededIdPaths } from '../common/seedDataset'
import { scaledWins, TITLE_COMPETITION, WINS_COMPETITION } from './lib/dataset'
import { loadFormula1Dataset } from './lib/seed'

const TITLES_SOURCE = 'jolpica'

/**
 * Step 7 of the Formula 1 pipeline: the constructors' prestige inputs (023_season_prestige.sql).
 *
 * A constructor's Grand Prix wins that season — scaled to a 20-race season, as podiums are — go
 * where football writes its European wins, under `WINS_COMPETITION`; the constructors' title (from 1958) is the title, under `TITLE_COMPETITION`.
 * Both competitions and their weights are rows of `prestige_competitions` (031_formula1.sql).
 *
 * Then the scores are recomputed (prestige first, inside `compute_fame_scores`).
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadFormula1Dataset()
  const clubIds = loadSeededIds(seededIdPaths('formula1').clubs)
  if (Object.keys(clubIds).length === 0) {
    throw new Error('No seeded constructors — run "npm run seed:formula1:clubs" first.')
  }

  const runs = dataset.constructorSeasons
    .filter((run) => clubIds[run.clubSourceId] && scaledWins(run) > 0)
    .map((run) => ({
      clubId: clubIds[run.clubSourceId],
      season: run.season,
      wins: { [WINS_COMPETITION]: scaledWins(run) },
    }))
  const titles = dataset.constructorSeasons
    .filter((run) => clubIds[run.clubSourceId] && run.champion)
    .map((run) => ({ clubId: clubIds[run.clubSourceId], season: run.season, competition: TITLE_COMPETITION }))

  console.log(`${runs.length} constructor-seasons with a win, ${titles.length} constructors' titles.`)

  if (dryRun) {
    console.log('Done (dry run, no DB writes).')
    return
  }

  try {
    const db = getDb()
    const { written: runsWritten } = await importContinentalWins(db, 'formula1', runs)
    const { written: titlesWritten } = await importClubTitles(db, 'formula1', TITLES_SOURCE, titles)
    const { scored } = await computeFameScores(db, 'formula1')
    console.log(`Done. runs written=${runsWritten}/${runs.length}, titles written=${titlesWritten}, scored=${scored}`)
  } catch (err) {
    throw new Error(`Failed to import prestige: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
