import { getDb } from '../common/env'
import { seedClubs } from '../common/seedSteps'
import { loadFormula1Dataset } from './lib/seed'

/** Step 3 of the Formula 1 pipeline: one club row per Jolpica constructor in the built dataset. */
async function main() {
  const dryRun = process.argv.includes('--dry-run')
  await seedClubs(getDb(), 'formula1', loadFormula1Dataset().clubs, { dryRun })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
