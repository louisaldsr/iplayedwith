import { getDb } from '../common/env'
import { seedClubs } from '../common/seedSteps'
import { loadBasketballDataset } from './lib/seed'

/** Step 3 of the basketball pipeline: one club row per team name in the built dataset. */
async function main() {
  const dryRun = process.argv.includes('--dry-run')
  await seedClubs(getDb(), 'basketball', loadBasketballDataset().clubs, { dryRun })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
