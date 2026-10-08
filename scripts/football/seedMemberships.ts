import { getDb } from '../common/env'
import { seedMemberships } from '../common/seedSteps'
import { loadFootballDataset, toSeedDataset } from './lib/seed'

/** Step 4 of the football pipeline: the dataset's (player, club, season) rows become memberships. */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadFootballDataset()
  // A dataset built before memberships carried games has no `games` key at all. Seeding it
  // would write NULL everywhere and silently drop the signal, so stop and say how to fix it.
  if (dataset.memberships.some((m) => m.games === undefined)) {
    throw new Error('The dataset predates membership games. Re-run "npm run seed:football:build".')
  }

  await seedMemberships(getDb(), 'football', toSeedDataset(dataset).memberships, { dryRun })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
