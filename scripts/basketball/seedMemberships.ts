import { getDb } from '../common/env'
import { seedMemberships } from '../common/seedSteps'
import { loadBasketballDataset } from './lib/seed'

/** Step 5 of the basketball pipeline: the dataset's (player, club, season) rows become memberships. */
async function main() {
  const dryRun = process.argv.includes('--dry-run')
  await seedMemberships(getDb(), 'basketball', loadBasketballDataset().memberships, { dryRun })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
