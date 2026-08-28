import path from 'node:path'
import { getDb } from './lib/env'
import { hasNoProfessionalCareer } from './lib/playerProfileParser'
import { loadJson, saveJson, type PlayerMap, type PlayerMapEntry, type SeededMap, type SeededMapEntry } from './lib/playerMap'
import { fetchWithCache } from './lib/fetchWithCache'
import { createPlayer, listPlayers } from '@/services/playersService'
import { ServiceError } from '@/services/errors'

const SAVE_EVERY = 25

function seededEntry(
  entry: PlayerMapEntry,
  status: SeededMapEntry['status'],
  extra: Partial<Pick<SeededMapEntry, 'playerId' | 'reason'>> = {},
): SeededMapEntry {
  return { status, name: entry.name, nationality: entry.nationality, profileUrl: entry.profileUrl, ...extra }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const mapPath = path.resolve(__dirname, 'output', 'players-map.json')
  const seededPath = path.resolve(__dirname, 'output', 'players-seeded.json')
  const profilesDir = path.resolve(__dirname, 'input/players/profiles')

  const map = loadJson<PlayerMap>(mapPath, {})
  const entries = Object.entries(map)
  if (entries.length === 0) {
    console.error(`No players found in ${mapPath} — run mapPlayers.ts first.`)
    process.exit(1)
  }

  const seeded = loadJson<SeededMap>(seededPath, {})
  const db = getDb()

  // Names already in the DB (any source, including the admin UI), plus names created
  // during this run — checked before every creation so the same real person appearing
  // under a different allrugbyId (or entered by hand) doesn't get a duplicate row.
  const existingNames = new Set((await listPlayers(db, 'rugby')).map((p) => p.name))

  let processed = 0
  let saved = 0
  let rejected = 0
  let manualCheck = 0
  let failed = 0
  let skipped = 0

  for (const [allrugbyId, entry] of entries) {
    const existing = seeded[allrugbyId]
    if (existing && (existing.status === 'saved' || existing.status === 'rejected' || existing.status === 'manual check')) {
      skipped++
      continue
    }

    processed++
    if (processed % SAVE_EVERY === 0) {
      console.log(`... ${processed} players processed`)
      saveJson(seededPath, seeded)
    }

    const profilePath = path.join(profilesDir, `${allrugbyId}.html`)
    let html: string
    try {
      // Already cached by mapPlayers.ts — this only hits the network if the file is missing.
      html = await fetchWithCache(entry.profileUrl, profilePath)
    } catch (err) {
      failed++
      seeded[allrugbyId] = seededEntry(entry, 'failure', { reason: (err as Error).message })
      console.error(`Failed to read profile for "${entry.name}" (${allrugbyId}): ${(err as Error).message}`)
      continue
    }

    if (hasNoProfessionalCareer(html)) {
      rejected++
      seeded[allrugbyId] = seededEntry(entry, 'rejected', { reason: 'no professional career' })
      continue
    }

    if (existingNames.has(entry.name)) {
      manualCheck++
      seeded[allrugbyId] = seededEntry(entry, 'manual check', {
        reason: `name collision with an existing player named "${entry.name}"`,
      })
      continue
    }

    if (dryRun) {
      saved++
      existingNames.add(entry.name)
      continue
    }

    try {
      const created = await createPlayer(db, { name: entry.name, sport: 'rugby', nationality: entry.nationality ?? undefined })
      seeded[allrugbyId] = seededEntry(entry, 'saved', { playerId: created.id })
      existingNames.add(entry.name)
      saved++
    } catch (err) {
      failed++
      const message = err instanceof ServiceError ? err.message : String(err)
      seeded[allrugbyId] = seededEntry(entry, 'failure', { reason: message })
      console.error(`Failed to create player "${entry.name}" (${allrugbyId}): ${message}`)
    }
  }

  saveJson(seededPath, seeded)
  console.log(
    `Done${dryRun ? ' (dry run, no DB writes)' : ''}. total=${entries.length} processed=${processed} ` +
      `skipped=${skipped} saved=${saved} rejected=${rejected} manualCheck=${manualCheck} failed=${failed}`,
  )
  console.log(`Seeded map written to ${seededPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
