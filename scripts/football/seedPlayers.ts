import { getDb } from '../common/env'
import { saveJson } from '../common/json'
import { PLAYERS_SEEDED_PATH, loadFootballDataset, loadSeededIds } from './lib/seed'
import { createPlayers } from '@/services/playersService'
import { ServiceError } from '@/services/errors'

/** Players per `createPlayers` call. Each call is one insert request per 500 rows inside the repository; this is the unit of resumability. */
const CHUNK_SIZE = 500

/**
 * Step 3 of the football pipeline: creates a player row for each of the ~11.5k players
 * in the built dataset, recording `transfermarkt player_id -> our UUID`.
 *
 * Progress is written after every chunk, so an interrupted run resumes where it stopped
 * instead of creating duplicate rows — there is no duplicate-name guard on players (real
 * people share names), so the id map is the only thing preventing double-creation.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const dataset = loadFootballDataset()
  const seeded = loadSeededIds(PLAYERS_SEEDED_PATH)
  const db = getDb()

  const pending = dataset.players.filter((p) => !seeded[p.transfermarktId])
  const skipped = dataset.players.length - pending.length
  console.log(`${dataset.players.length} players in dataset — ${skipped} already seeded, ${pending.length} to create.`)

  if (dryRun) {
    console.log(`Done (dry run, no DB writes). would create=${pending.length}`)
    return
  }

  let created = 0
  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE)
    try {
      const saved = await createPlayers(
        db,
        chunk.map((p) => ({ name: p.name, sport: 'football' as const, nationality: p.nationality ?? undefined })),
      )
      // createPlayers preserves input order, so the two arrays line up.
      chunk.forEach((p, index) => {
        seeded[p.transfermarktId] = saved[index].id
      })
      created += saved.length
    } catch (err) {
      saveJson(PLAYERS_SEEDED_PATH, seeded)
      const message = err instanceof ServiceError ? err.message : String(err)
      throw new Error(`Failed at chunk starting index ${i} (${created} created so far, progress saved): ${message}`)
    }

    saveJson(PLAYERS_SEEDED_PATH, seeded)
    console.log(`... ${created}/${pending.length} players created`)
  }

  saveJson(PLAYERS_SEEDED_PATH, seeded)
  console.log(`Done. total=${dataset.players.length} created=${created} skipped=${skipped}`)
  console.log(`Player id map written to ${PLAYERS_SEEDED_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
