import { getDb } from '../common/env'
import { seedPlayers } from '../common/seedSteps'
import { loadBasketballDataset } from './lib/seed'

/** Step 4 of the basketball pipeline: a player row for each Basketball-Reference player in the built dataset. */
async function main() {
  const dryRun = process.argv.includes('--dry-run')
  await seedPlayers(getDb(), 'basketball', loadBasketballDataset().players, { dryRun })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
