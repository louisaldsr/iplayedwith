import { getDb } from '../common/env'
import { seedPlayers } from '../common/seedSteps'
import { loadFootballDataset, toSeedDataset } from './lib/seed'

/** Step 3 of the football pipeline: a player row for each of the ~11.5k players in the built dataset. */
async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const { players } = toSeedDataset(loadFootballDataset())
  await seedPlayers(getDb(), 'football', players, { dryRun })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
