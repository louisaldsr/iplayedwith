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
import { nationTierWeight } from './lib/nationTiers'
import { CLUBS_SEEDED_PATH, PLAYERS_SEEDED_PATH, loadFootballDataset, loadSeededIds } from './lib/seed'

/** Owner of the football rows in `nation_tiers`: a re-run replaces exactly these. */
const TIERS_SOURCE = 'fifa-ranking'

/** The `capsByNation` key of caps whose national team did not resolve: no tier, the default weight. */
const UNKNOWN_NATION = 'unknown'

/**
 * Step 5 of the football pipeline: writes the fame inputs a membership import does not — each
 * player's international caps (total, and by national team) into `player_fame.details`, the
 * nation tiers from the dataset's FIFA ranking, and each membership's minutes (the club
 * performance reads the share of the squad's minutes: the source has no starts).
 *
 * Games played live on `memberships` (written by `seedMemberships`), where the score reads them.
 *
 * A step of its own rather than part of `seedPlayers`, because players are INSERTed once and
 * reattached from the id map on a re-run — so a signal written inside that step would never be
 * refreshed. Here, re-running is the point: the signals are overwritten every time, which is
 * what "recompute on each data import" means.
 *
 *
 * No progress file — one RPC per 1000 players, and re-running rewrites the same values. This
 * step writes `player_fame.details`, then recomputes every score of the sport.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadFootballDataset()
  const playerIds = loadSeededIds(PLAYERS_SEEDED_PATH)
  if (Object.keys(playerIds).length === 0) {
    throw new Error(`No players in ${PLAYERS_SEEDED_PATH} — run "npm run seed:football:players" first.`)
  }

  if (!dataset.nationalTeams) {
    throw new Error('The dataset carries no national teams — it predates them. Re-run "npm run seed:football:build".')
  }
  const clubIds = loadSeededIds(CLUBS_SEEDED_PATH)

  const rows: FameRowInput[] = []
  const unresolved: string[] = []

  for (const player of dataset.players) {
    const playerId = playerIds[player.transfermarktId]
    if (!playerId) {
      unresolved.push(player.transfermarktId)
      continue
    }
    // A dataset built before caps existed has no `caps` key at all; that would read as 0 here
    // and quietly score every player as uncapped.
    if (player.caps === undefined) {
      throw new Error('The dataset carries no caps — it predates them. Re-run "npm run seed:football:build".')
    }
    const nation = player.nationalTeam ?? UNKNOWN_NATION
    rows.push({ playerId, caps: player.caps, capsByNation: player.caps > 0 ? { [nation]: player.caps } : {} })
  }

  const tiers = dataset.nationalTeams.map((team) => ({ nation: team.name, weight: nationTierWeight(team.fifaRanking) }))

  // A dataset built before minutes existed has no `minutes` key: it would read as unknown here,
  // not as 0, and the club performance would fall to nothing without a word.
  const stats: MembershipStatsInput[] = []
  for (const m of dataset.memberships) {
    if (m.minutes === undefined) {
      throw new Error('The dataset carries no minutes — it predates them. Re-run "npm run seed:football:build".')
    }
    const playerId = playerIds[m.playerTransfermarktId]
    const clubId = clubIds[m.clubTransfermarktId]
    if (!playerId || !clubId) continue
    stats.push({ playerId, clubId, season: m.season, minutes: m.minutes })
  }

  if (unresolved.length > 0) {
    console.warn(
      `Skipping ${unresolved.length} player(s) not in the seeded id map (e.g. ${unresolved.slice(0, 3).join(', ')}).`,
    )
  }

  const withCaps = rows.filter((r) => r.caps > 0).length
  console.log(
    `${rows.length} players resolved — caps>0 for ${withCaps} ` +
      `(${((100 * withCaps) / Math.max(rows.length, 1)).toFixed(1)}%).`,
  )

  console.log(`${tiers.length} national teams ranked; ${stats.length} memberships with minutes.`)

  if (dryRun) {
    console.log(`Done (dry run, no DB writes). would write=${rows.length} details, ${stats.length} memberships`)
    return
  }

  try {
    const db = getDb()
    const { written } = await importFameDetails(db, 'football', rows)
    const { written: tiersWritten } = await importNationTiers(db, 'football', TIERS_SOURCE, tiers)
    const { written: statsWritten } = await importMembershipStats(db, 'football', stats)
    // Scored right away: the signals just moved, so every stored score is now stale.
    const { scored } = await computeFameScores(db, 'football')
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
