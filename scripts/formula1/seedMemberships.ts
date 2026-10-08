import { getDb } from '../common/env'
import { seedMemberships } from '../common/seedSteps'
import { loadFormula1Dataset } from './lib/seed'

/** Step 5 of the Formula 1 pipeline: the dataset's (driver, constructor, year) rows become memberships. */
async function main() {
  const dryRun = process.argv.includes('--dry-run')
  await seedMemberships(getDb(), 'formula1', loadFormula1Dataset().memberships, { dryRun })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
