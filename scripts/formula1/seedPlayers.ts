import { getDb } from '../common/env'
import { seedPlayers } from '../common/seedSteps'
import { loadFormula1Dataset } from './lib/seed'

/** Step 4 of the Formula 1 pipeline: a player row for each driver in the built dataset. */
async function main() {
  const dryRun = process.argv.includes('--dry-run')
  await seedPlayers(getDb(), 'formula1', loadFormula1Dataset().players, { dryRun })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
