import {
  computeFameScores,
  importFameDetails,
  importMembershipStats,
  importNationTiers,
  type FameRowInput,
  type MembershipStatsInput,
} from '@/services/fameService'
import { ServiceError } from '@/services/errors'
import { getDb } from '../common/env'
import { loadSeededIds, seededIdPaths } from '../common/seedDataset'
import { RESULTS_ENTRY } from './lib/dataset'
import { loadFormula1Dataset } from './lib/seed'

/** Owner of the Formula 1 row in `nation_tiers`: a re-run replaces exactly it. */
const TIERS_SOURCE = 'formula1-results'

/**
 * Step 6 of the Formula 1 pipeline: the fame inputs a membership import does not write —
 *
 * - each driver's podiums, scaled to a 20-race season, into `player_fame.details.capsByNation`
 *   under `RESULTS_ENTRY`: Formula 1 has no national team, so the pillar caps fill elsewhere is
 *   filled by the driver's own results (see lib/dataset.ts). Rounded: the column takes whole counts;
 * - that entry's weight in `nation_tiers`: 1, the top tier;
 * - each membership's starts — the driver's share of his constructor's season. No minutes.
 *
 * Then the scores are recomputed. Re-running rewrites the same values.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadFormula1Dataset()
  const paths = seededIdPaths('formula1')
  const playerIds = loadSeededIds(paths.players)
  const clubIds = loadSeededIds(paths.clubs)
  if (Object.keys(playerIds).length === 0 || Object.keys(clubIds).length === 0) {
    throw new Error('No seeded drivers or constructors — run "npm run seed:formula1:clubs" and ":players" first.')
  }

  // Every driver gets a row: a driver who never reached a podium has 0, not "unknown" — the source
  // lists every result.
  const rows: FameRowInput[] = []
  for (const player of dataset.players) {
    const playerId = playerIds[player.sourceId]
    if (!playerId) continue
    const podiums = Math.round(player.podiumsScaled)
    rows.push({ playerId, caps: podiums, capsByNation: { [RESULTS_ENTRY]: podiums } })
  }

  const stats: MembershipStatsInput[] = []
  for (const m of dataset.memberships) {
    const playerId = playerIds[m.playerSourceId]
    const clubId = clubIds[m.clubSourceId]
    if (!playerId || !clubId) continue
    stats.push({ playerId, clubId, season: m.season, starts: m.starts, minutes: null })
  }

  console.log(
    `${rows.length} drivers (${rows.filter((r) => r.caps > 0).length} with a podium), ` +
      `${stats.length} memberships with starts.`,
  )

  if (dryRun) {
    console.log('Done (dry run, no DB writes).')
    return
  }

  try {
    const db = getDb()
    const { written } = await importFameDetails(db, 'formula1', rows)
    const { written: tiersWritten } = await importNationTiers(db, 'formula1', TIERS_SOURCE, [
      { nation: RESULTS_ENTRY, weight: 1 },
    ])
    const { written: statsWritten } = await importMembershipStats(db, 'formula1', stats)
    // Scored right away: the signals just moved, so every stored score is now stale.
    const { scored } = await computeFameScores(db, 'formula1')
    console.log(
      `Done. details written=${written}, nation tiers=${tiersWritten}, ` +
        `memberships written=${statsWritten}/${stats.length}, scored=${scored}`,
    )
  } catch (err) {
    throw new Error(`Failed to import fame: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
