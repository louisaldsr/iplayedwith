import { importFameDetails, type FameRowInput } from '@/services/fameService'
import { ServiceError } from '@/services/errors'
import { getDb } from '../common/env'
import { PLAYERS_SEEDED_PATH, loadFootballDataset, loadSeededIds } from './lib/seed'

/**
 * Step 5 of the football pipeline: writes each player's international caps as fame signals.
 *
 * Only caps: games played live on `memberships` (written by `seedMemberships`), where the score
 * reads them alongside the seasons they are divided by.
 *
 * A step of its own rather than part of `seedPlayers`, because players are INSERTed once and
 * reattached from the id map on a re-run — so a signal written inside that step would never be
 * refreshed. Here, re-running is the point: the signals are overwritten every time, which is
 * what "recompute on each data import" means.
 *
 *
 * No progress file — one RPC per 1000 players, and re-running rewrites the same values. This
 * step writes `player_fame.details` only; the score is derived from it separately and stays
 * NULL until that runs.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadFootballDataset()
  const playerIds = loadSeededIds(PLAYERS_SEEDED_PATH)
  if (Object.keys(playerIds).length === 0) {
    throw new Error(`No players in ${PLAYERS_SEEDED_PATH} — run "npm run seed:football:players" first.`)
  }

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
    rows.push({ playerId, caps: player.caps })
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

  if (dryRun) {
    console.log(`Done (dry run, no DB writes). would write=${rows.length}`)
    return
  }

  try {
    const { written } = await importFameDetails(getDb(), 'football', rows)
    console.log(`Done. details written=${written}`)
  } catch (err) {
    throw new Error(`Failed to import fame: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
