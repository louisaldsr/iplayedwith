import path from 'node:path'
import { getDb } from '../common/env'
import { loadJson, saveJson } from '../common/json'
import { inputPath, outputPath } from '../common/paths'
import { sourceOf, type PlayerMap, type PlayerMapEntry, type SeededMap, type SeededMapEntry } from './lib/playerMap'
import { fetchWithCache } from '../common/fetchWithCache'
import { SOURCES } from './lib/sources'
import { createPlayer } from '@/services/playersService'
import { ServiceError } from '@/services/errors'

const SAVE_EVERY = 25

function seededEntry(
  entry: PlayerMapEntry,
  status: SeededMapEntry['status'],
  extra: Partial<Pick<SeededMapEntry, 'playerId' | 'reason'>> = {},
): SeededMapEntry {
  return {
    status,
    name: entry.name,
    nationality: entry.nationality,
    profileUrl: entry.profileUrl,
    source: entry.source,
    ...extra,
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const mapPath = outputPath('players-map.json')
  const seededPath = outputPath('players-seeded.json')
  const profilesDir = inputPath('players', 'profiles')

  const map = loadJson<PlayerMap>(mapPath, {})
  const entries = Object.entries(map)
  if (entries.length === 0) {
    console.error(`No players found in ${mapPath} — run mapPlayers.ts first.`)
    process.exit(1)
  }

  const seeded = loadJson<SeededMap>(seededPath, {})
  const db = getDb()

  let processed = 0
  let saved = 0
  let rejected = 0
  let failed = 0
  let skipped = 0

  for (const [id, entry] of entries) {
    const existing = seeded[id]
    if (existing && (existing.status === 'saved' || existing.status === 'rejected')) {
      skipped++
      continue
    }

    processed++
    if (processed % SAVE_EVERY === 0) {
      console.log(`... ${processed} players processed`)
      saveJson(seededPath, seeded)
    }

    const source = sourceOf(entry)
    const adapter = SOURCES[source]

    const profilePath = path.join(profilesDir, `${source}-${id}.html`)
    let html: string
    try {
      // Already cached by mapPlayers.ts — this only hits the network if the file is missing.
      html = await fetchWithCache(entry.profileUrl, profilePath)
    } catch (err) {
      failed++
      seeded[id] = seededEntry(entry, 'failure', { reason: (err as Error).message })
      console.error(`Failed to read profile for "${entry.name}" (${id}): ${(err as Error).message}`)
      continue
    }

    if (adapter.hasNoCareerRows(html)) {
      rejected++
      seeded[id] = seededEntry(entry, 'rejected', { reason: 'no professional career' })
      continue
    }

    if (dryRun) {
      saved++
      continue
    }

    try {
      const created = await createPlayer(db, {
        name: entry.name,
        sport: 'rugby',
        nationality: entry.nationality ?? undefined,
      })
      seeded[id] = seededEntry(entry, 'saved', { playerId: created.id })
      saved++
    } catch (err) {
      failed++
      const message = err instanceof ServiceError ? err.message : String(err)
      seeded[id] = seededEntry(entry, 'failure', { reason: message })
      console.error(`Failed to create player "${entry.name}" (${id}): ${message}`)
    }
  }

  saveJson(seededPath, seeded)
  console.log(
    `Done${dryRun ? ' (dry run, no DB writes)' : ''}. total=${entries.length} processed=${processed} ` +
      `skipped=${skipped} saved=${saved} rejected=${rejected} failed=${failed}`,
  )
  console.log(`Seeded map written to ${seededPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
