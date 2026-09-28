import { isSportId, SPORTS } from '@/domain/sport'
import { computeFameScores } from '@/services/fameService'
import { getDb } from './env'

/**
 * Recomputes every fame score of one sport from the signals already in the database.
 *
 * The seedFame steps already do this at the end of an import. This is the path for everything
 * else: after the formula or a `fame_calibration` constant changed, no re-import needed.
 * Then read the result with `fame:report`.
 */
async function main() {
  const sportArg = process.argv.find((a) => a.startsWith('--sport='))?.split('=')[1]
  if (!sportArg || !isSportId(sportArg)) {
    console.error(`Usage: fame:compute -- --sport=<${SPORTS.join('|')}>`)
    process.exit(1)
  }

  const { scored } = await computeFameScores(getDb(), sportArg)
  console.log(`Done. ${sportArg}: ${scored} players scored.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
