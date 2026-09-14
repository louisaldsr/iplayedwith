import { getDb } from '../common/env'
import { CLUBS_SEEDED_PATH, PLAYERS_SEEDED_PATH, loadFootballDataset, loadSeededIds } from './lib/seed'
import { upsertMembershipsBulk, type BulkMembershipRowInput } from '@/services/membershipsService'
import { ServiceError } from '@/services/errors'

/**
 * Step 4 of the football pipeline: turns the dataset's (player, club, season) rows into
 * memberships, resolving both ends through the id maps the club and player steps wrote.
 *
 * No progress file of its own — the writes are upserts keyed on
 * (player_id, club_id, season), so re-running simply rewrites the same rows.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadFootballDataset()
  const clubIds = loadSeededIds(CLUBS_SEEDED_PATH)
  const playerIds = loadSeededIds(PLAYERS_SEEDED_PATH)

  if (Object.keys(clubIds).length === 0) throw new Error(`No clubs in ${CLUBS_SEEDED_PATH} — run "npm run seed:football:clubs" first.`)
  if (Object.keys(playerIds).length === 0) throw new Error(`No players in ${PLAYERS_SEEDED_PATH} — run "npm run seed:football:players" first.`)

  const rows: BulkMembershipRowInput[] = []
  const unresolved = { clubs: new Set<string>(), players: new Set<string>() }

  for (const membership of dataset.memberships) {
    const clubId = clubIds[membership.clubTransfermarktId]
    const playerId = playerIds[membership.playerTransfermarktId]
    if (!clubId) unresolved.clubs.add(membership.clubTransfermarktId)
    if (!playerId) unresolved.players.add(membership.playerTransfermarktId)
    if (!clubId || !playerId) continue

    rows.push({
      playerId,
      clubId,
      season: membership.season,
      competition: membership.competition ?? undefined,
    })
  }

  if (unresolved.clubs.size > 0 || unresolved.players.size > 0) {
    console.warn(
      `Skipping rows with unresolved ids: ${unresolved.clubs.size} club(s), ${unresolved.players.size} player(s) ` +
        `not in the seeded id maps — re-run the clubs/players steps if this is unexpected.`,
    )
  }

  console.log(`${dataset.memberships.length} memberships in dataset, ${rows.length} resolved.`)

  if (dryRun) {
    console.log(`Done (dry run, no DB writes). would upsert=${rows.length}`)
    return
  }

  try {
    const written = await upsertMembershipsBulk(getDb(), 'football', rows)
    console.log(`Done. memberships upserted=${written}`)
  } catch (err) {
    throw new Error(`Failed to upsert memberships: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
