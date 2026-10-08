import { computeFameScores } from '@/services/fameService'
import { importClubTitles, importContinentalWins } from '@/services/prestigeService'
import { ServiceError } from '@/services/errors'
import { getDb } from '../common/env'
import { loadSeededIds, seededIdPaths } from '../common/seedDataset'
import { PLAYOFFS_COMPETITION, TITLE_COMPETITION } from './lib/dataset'
import { loadBasketballDataset } from './lib/seed'

const TITLES_SOURCE = 'basketball-reference'

/**
 * Step 7 of the basketball pipeline: the squads' prestige inputs (023_season_prestige.sql).
 *
 * The playoffs are the basketball counterpart of a European run — the stage beyond the regular
 * season, played in front of everyone — so a club-season's playoff wins go where football writes
 * its Champions League wins, under `PLAYOFFS_COMPETITION`. Winning the Finals is the title, under
 * `TITLE_COMPETITION`. Both competitions and their weights are rows of `prestige_competitions`
 * (029_basketball_fame.sql).
 *
 * Then the scores are recomputed (prestige first, inside `compute_fame_scores`).
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadBasketballDataset()
  if (!dataset.clubSeasons) {
    throw new Error('The dataset predates playoff runs. Re-run "npm run seed:basketball:build".')
  }
  const clubIds = loadSeededIds(seededIdPaths('basketball').clubs)
  if (Object.keys(clubIds).length === 0) {
    throw new Error('No seeded clubs — run "npm run seed:basketball:clubs" first.')
  }

  const runs = dataset.clubSeasons
    .filter((run) => clubIds[run.clubSourceId] && run.playoffWins > 0)
    .map((run) => ({
      clubId: clubIds[run.clubSourceId],
      season: run.season,
      wins: { [PLAYOFFS_COMPETITION]: run.playoffWins },
    }))
  const titles = dataset.clubSeasons
    .filter((run) => clubIds[run.clubSourceId] && run.champion)
    .map((run) => ({ clubId: clubIds[run.clubSourceId], season: run.season, competition: TITLE_COMPETITION }))

  console.log(`${runs.length} club-seasons with playoff wins, ${titles.length} NBA titles.`)

  if (dryRun) {
    console.log('Done (dry run, no DB writes).')
    return
  }

  try {
    const db = getDb()
    const { written: runsWritten } = await importContinentalWins(db, 'basketball', runs)
    const { written: titlesWritten } = await importClubTitles(db, 'basketball', TITLES_SOURCE, titles)
    const { scored } = await computeFameScores(db, 'basketball')
    console.log(`Done. runs written=${runsWritten}/${runs.length}, titles written=${titlesWritten}, scored=${scored}`)
  } catch (err) {
    throw new Error(`Failed to import prestige: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
