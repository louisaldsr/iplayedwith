/**
 * Imports data/<sport>/clubs/*.csv, data/<sport>/players/*.csv,
 * data/<sport>/memberships/<season>/*.csv into Supabase, for every sport in
 * src/domain/sport.ts's SPORTS list.
 *
 * clubs   : name, competition, id — any number of files under data/<sport>/clubs/.
 * players : name, id — any number of files under data/<sport>/players/ (e.g. sharded
 *   by first letter: a.csv, b.csv, ...).
 *   New rows (blank `id`) get a fresh UUID generated and written back into
 *   the CSV, so re-running keeps the same id for the same row instead of
 *   minting a new one each time.
 * memberships : player_id, club_id — no season column. Each subfolder of
 *   data/<sport>/memberships/ is named after a season ("2022-2023") and every CSV
 *   inside it is seeded with that season, so re-organizing seasons is just
 *   moving files between folders.
 *
 * A sport with no data yet (its data/<sport>/ subfolders missing or empty)
 * is skipped cleanly — no clubs/players/memberships is not an error.
 *
 * Idempotent (upserts on primary key) — safe to re-run after editing the CSVs.
 *
 * Usage: npm run db:import
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { admin } from './lib/supabaseAdmin'
import { SPORTS, SportId } from '../src/domain/sport'

type ClubRow = { name: string; competition?: string; id?: string }
type PlayerRow = { name: string; id?: string }
type MembershipRow = { player_id: string; club_id: string }

function csvFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.csv'))
    .map(f => join(dir, f))
    .sort()
}

function seasonDirs(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
}

function readCsv<T>(path: string): T[] {
  return parse(readFileSync(path, 'utf-8'), { columns: true, skip_empty_lines: true, trim: true })
}

/** Fills in a UUID for any row missing one and persists the result back to its file. */
function assignIds<T extends { id?: string }>(path: string, columns: string[]): T[] {
  const rows = readCsv<T>(path)
  let changed = false

  for (const row of rows) {
    if (!row.id?.trim()) {
      row.id = randomUUID()
      changed = true
    }
  }

  if (changed) {
    writeFileSync(path, stringify(rows, { header: true, columns }))
    console.log(`Assigned new id(s) in ${path}`)
  }

  return rows
}

async function importSport(sport: SportId) {
  const base = join('data', sport)

  // ── Clubs ──────────────────────────────────────────────────────────────
  const clubRows: ClubRow[] = csvFiles(join(base, 'clubs')).flatMap(f => assignIds<ClubRow>(f, ['name', 'competition', 'id']))
  const clubIds = new Set(clubRows.map(c => c.id!))

  console.log(`[${sport}] Seeding ${clubRows.length} clubs...`)
  if (clubRows.length > 0) {
    const { error: clubsError } = await admin
      .from('clubs')
      .upsert(clubRows.map(c => ({ id: c.id, name: c.name, competition: c.competition || null, sport })))
    if (clubsError) throw clubsError
  }

  // ── Players ────────────────────────────────────────────────────────────
  const playerRows: PlayerRow[] = csvFiles(join(base, 'players')).flatMap(f => assignIds<PlayerRow>(f, ['name', 'id']))
  const playerIds = new Set(playerRows.map(p => p.id!))

  console.log(`[${sport}] Seeding ${playerRows.length} players...`)
  if (playerRows.length > 0) {
    const { error: playersError } = await admin
      .from('players')
      .upsert(playerRows.map(p => ({ id: p.id, name: p.name, sport })))
    if (playersError) throw playersError
  }

  // ── Memberships — one folder per season, season inferred from folder name ─
  const seasons = seasonDirs(join(base, 'memberships'))
  const memberships: { player_id: string; club_id: string; season: string }[] = []

  for (const season of seasons) {
    if (!/^\d{4}-\d{4}$/.test(season)) {
      throw new Error(`${base}/memberships/${season}: folder name must look like "2022-2023"`)
    }
    for (const file of csvFiles(join(base, 'memberships', season))) {
      const rows = readCsv<MembershipRow>(file)
      rows.forEach((m, i) => {
        if (!playerIds.has(m.player_id)) {
          throw new Error(`${file} row ${i + 2}: player_id "${m.player_id}" not found in ${base}/players/*.csv`)
        }
        if (!clubIds.has(m.club_id)) {
          throw new Error(`${file} row ${i + 2}: club_id "${m.club_id}" not found in ${base}/clubs/*.csv`)
        }
        memberships.push({ player_id: m.player_id, club_id: m.club_id, season })
      })
    }
  }

  console.log(`[${sport}] Seeding ${memberships.length} memberships across ${seasons.length} season(s)...`)
  if (memberships.length > 0) {
    const { error: membershipsError } = await admin
      .from('memberships')
      .upsert(memberships, { onConflict: 'player_id,club_id,season' })
    if (membershipsError) throw membershipsError
  }
}

async function main() {
  for (const sport of SPORTS) {
    await importSport(sport)
  }
  console.log('Done.')
}

main().catch(err => {
  console.error(err.message ?? err)
  process.exit(1)
})
