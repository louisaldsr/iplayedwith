import { getDb } from '../common/env'
import { seedClubs } from '../common/seedSteps'
import { loadFootballDataset, toSeedDataset } from './lib/seed'

/** Step 2 of the football pipeline: one club row per Transfermarkt club in the built dataset (176 of them). */
async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const { clubs } = toSeedDataset(loadFootballDataset())
  await seedClubs(getDb(), 'football', clubs, { dryRun })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
