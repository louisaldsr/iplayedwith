import { getDb } from '../common/env'
import { saveJson } from '../common/json'
import { CLUBS_SEEDED_PATH, loadFootballDataset, loadSeededIds } from './lib/seed'
import { createClub, findClubByName } from '@/services/clubsService'
import { ConflictError, ServiceError } from '@/services/errors'

/**
 * Step 2 of the football pipeline: creates one club row per Transfermarkt club in the
 * built dataset (176 of them), recording `transfermarkt club_id -> our UUID` so the
 * memberships step can resolve club ends and so a re-run skips what already exists.
 *
 * Clubs are created one at a time on purpose: the volume is small, and `createClub`'s
 * case-insensitive duplicate-name guard is worth keeping.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadFootballDataset()
  const seeded = loadSeededIds(CLUBS_SEEDED_PATH)
  const db = getDb()

  let created = 0
  let reattached = 0
  let skipped = 0
  let failed = 0

  for (const club of dataset.clubs) {
    if (seeded[club.transfermarktId]) {
      skipped++
      continue
    }

    if (dryRun) {
      created++
      continue
    }

    try {
      const saved = await createClub(db, { name: club.name, sport: 'football', logoUrl: club.logoUrl })
      seeded[club.transfermarktId] = saved.id
      created++
    } catch (err) {
      // A club of that name already exists — either this script died before writing its
      // progress file, or it was added by hand in the admin UI. Either way the right move
      // is to adopt the existing row, not to create a near-duplicate.
      if (err instanceof ConflictError) {
        const existing = await findClubByName(db, club.name, 'football')
        if (existing) {
          seeded[club.transfermarktId] = existing.id
          reattached++
          continue
        }
      }
      failed++
      console.error(`Failed to create club "${club.name}" (${club.transfermarktId}): ${err instanceof ServiceError ? err.message : String(err)}`)
    }
  }

  if (!dryRun) saveJson(CLUBS_SEEDED_PATH, seeded)

  console.log(
    `Done${dryRun ? ' (dry run, no DB writes)' : ''}. total=${dataset.clubs.length} created=${created} ` +
      `reattached=${reattached} skipped=${skipped} failed=${failed}`,
  )
  if (!dryRun) console.log(`Club id map written to ${CLUBS_SEEDED_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
