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
import { rankTierWeight } from '../common/nationTiers'
import { loadSeededIds, seededIdPaths } from '../common/seedDataset'
import { loadBasketballDataset } from './lib/seed'

/** Owner of the basketball rows in `nation_tiers`: a re-run replaces exactly these. */
const TIERS_SOURCE = 'fiba-ranking'

/**
 * Step 6 of the basketball pipeline: the fame inputs a membership import does not write —
 *
 * - each player's FIBA senior caps, by national team, into `player_fame.details` (a player with no
 *   FIBA page gets no row: unknown, not uncapped);
 * - the nation tiers, from the FIBA men's ranking (the shared rule, scripts/common/nationTiers.ts);
 * - each membership's starts and minutes — the club performance's share of the squad.
 *
 * Then the scores are recomputed. Re-running rewrites the same values.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadBasketballDataset()
  if (!dataset.nations) {
    throw new Error('The dataset predates fame inputs. Re-run "npm run seed:basketball:build".')
  }
  const paths = seededIdPaths('basketball')
  const playerIds = loadSeededIds(paths.players)
  const clubIds = loadSeededIds(paths.clubs)
  if (Object.keys(playerIds).length === 0 || Object.keys(clubIds).length === 0) {
    throw new Error('No seeded players or clubs — run "npm run seed:basketball:clubs" and ":players" first.')
  }

  const rows: FameRowInput[] = []
  for (const player of dataset.players) {
    const playerId = playerIds[player.sourceId]
    if (!playerId || player.capsByNation === null) continue
    const caps = Object.values(player.capsByNation).reduce((sum, n) => sum + n, 0)
    rows.push({ playerId, caps, capsByNation: player.capsByNation })
  }

  const tiers = dataset.nations.map((nation) => ({ nation: nation.fibaCode, weight: rankTierWeight(nation.worldRank) }))

  const stats: MembershipStatsInput[] = []
  for (const m of dataset.memberships) {
    const playerId = playerIds[m.playerSourceId]
    const clubId = clubIds[m.clubSourceId]
    if (!playerId || !clubId) continue
    stats.push({ playerId, clubId, season: m.season, starts: m.starts, minutes: m.minutes })
  }

  const capped = rows.filter((r) => r.caps > 0).length
  console.log(
    `${rows.length} players with FIBA caps known (${capped} capped), ${tiers.length} nations ranked, ` +
      `${stats.length} memberships with starts/minutes.`,
  )

  if (dryRun) {
    console.log('Done (dry run, no DB writes).')
    return
  }

  try {
    const db = getDb()
    const { written } = await importFameDetails(db, 'basketball', rows)
    const { written: tiersWritten } = await importNationTiers(db, 'basketball', TIERS_SOURCE, tiers)
    const { written: statsWritten } = await importMembershipStats(db, 'basketball', stats)
    // Scored right away: the signals just moved, so every stored score is now stale.
    const { scored } = await computeFameScores(db, 'basketball')
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
