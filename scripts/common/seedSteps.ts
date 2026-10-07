import type { SupabaseClient } from '@supabase/supabase-js'
import type { SportId } from '@/domain/sport'
import { createClub, findClubByName } from '@/services/clubsService'
import { ConflictError, ServiceError } from '@/services/errors'
import { upsertMembershipsBulk, type BulkMembershipRowInput } from '@/services/membershipsService'
import { createPlayers } from '@/services/playersService'
import { saveJson } from './json'
import {
  loadSeededIds,
  seededIdPaths,
  type SeedClub,
  type SeedMembership,
  type SeedPlayer,
  type SeededIdMap,
} from './seedDataset'

/**
 * The three seeding steps every sport runs once its import has produced a `SeedDataset`:
 * clubs, then players, then memberships. Each sport keeps a thin entry script per step that
 * loads its own dataset and calls these — the steps themselves know nothing about the source.
 */

export type SeedOptions = { dryRun: boolean }

/**
 * Creates one club row per dataset club, recording `sourceId -> our UUID` so the memberships
 * step can resolve club ends and so a re-run skips what already exists.
 *
 * Clubs are created one at a time on purpose: the volume is small, and `createClub`'s
 * case-insensitive duplicate-name guard is worth keeping.
 */
export async function seedClubs(db: SupabaseClient, sport: SportId, clubs: SeedClub[], { dryRun }: SeedOptions) {
  const seededPath = seededIdPaths(sport).clubs
  const seeded = loadSeededIds(seededPath)

  let created = 0
  let reattached = 0
  let skipped = 0
  let failed = 0

  for (const club of clubs) {
    if (seeded[club.sourceId]) {
      skipped++
      continue
    }

    if (dryRun) {
      created++
      continue
    }

    try {
      const saved = await createClub(db, { name: club.name, sport, logoUrl: club.logoUrl })
      seeded[club.sourceId] = saved.id
      created++
    } catch (err) {
      // A club of that name already exists — either this script died before writing its
      // progress file, or it was added by hand in the admin UI. Either way the right move
      // is to adopt the existing row, not to create a near-duplicate.
      if (err instanceof ConflictError) {
        const existing = await findClubByName(db, club.name, sport)
        if (existing) {
          seeded[club.sourceId] = existing.id
          reattached++
          continue
        }
      }
      failed++
      console.error(
        `Failed to create club "${club.name}" (${club.sourceId}): ${err instanceof ServiceError ? err.message : String(err)}`,
      )
    }
  }

  if (!dryRun) saveJson(seededPath, seeded)

  console.log(
    `Done${dryRun ? ' (dry run, no DB writes)' : ''}. total=${clubs.length} created=${created} ` +
      `reattached=${reattached} skipped=${skipped} failed=${failed}`,
  )
  if (!dryRun) console.log(`Club id map written to ${seededPath}`)
}

/** Players per `createPlayers` call. Each call is one insert request per 500 rows inside the repository; this is the unit of resumability. */
const PLAYER_CHUNK_SIZE = 500

/**
 * Creates a player row for each dataset player, recording `sourceId -> our UUID`.
 *
 * Progress is written after every chunk, so an interrupted run resumes where it stopped
 * instead of creating duplicate rows — there is no duplicate-name guard on players (real
 * people share names), so the id map is the only thing preventing double-creation.
 */
export async function seedPlayers(db: SupabaseClient, sport: SportId, players: SeedPlayer[], { dryRun }: SeedOptions) {
  const seededPath = seededIdPaths(sport).players
  const seeded = loadSeededIds(seededPath)

  const pending = players.filter((p) => !seeded[p.sourceId])
  const skipped = players.length - pending.length
  console.log(`${players.length} players in dataset — ${skipped} already seeded, ${pending.length} to create.`)

  if (dryRun) {
    console.log(`Done (dry run, no DB writes). would create=${pending.length}`)
    return
  }

  let created = 0
  for (let i = 0; i < pending.length; i += PLAYER_CHUNK_SIZE) {
    const chunk = pending.slice(i, i + PLAYER_CHUNK_SIZE)
    try {
      const saved = await createPlayers(
        db,
        chunk.map((p) => ({ name: p.name, sport, nationality: p.nationality ?? undefined })),
      )
      // createPlayers preserves input order, so the two arrays line up.
      chunk.forEach((p, index) => {
        seeded[p.sourceId] = saved[index].id
      })
      created += saved.length
    } catch (err) {
      saveJson(seededPath, seeded)
      const message = err instanceof ServiceError ? err.message : String(err)
      throw new Error(`Failed at chunk starting index ${i} (${created} created so far, progress saved): ${message}`)
    }

    saveJson(seededPath, seeded)
    console.log(`... ${created}/${pending.length} players created`)
  }

  saveJson(seededPath, seeded)
  console.log(`Done. total=${players.length} created=${created} skipped=${skipped}`)
  console.log(`Player id map written to ${seededPath}`)
}

/**
 * Resolves both ends of each dataset membership through the seeded-id maps. A row whose club
 * or player was never seeded is dropped and its source id reported, rather than failing the
 * whole import.
 */
export function resolveMembershipRows(
  memberships: SeedMembership[],
  clubIds: SeededIdMap,
  playerIds: SeededIdMap,
): { rows: BulkMembershipRowInput[]; unresolved: { clubs: Set<string>; players: Set<string> } } {
  const rows: BulkMembershipRowInput[] = []
  const unresolved = { clubs: new Set<string>(), players: new Set<string>() }

  for (const membership of memberships) {
    const clubId = clubIds[membership.clubSourceId]
    const playerId = playerIds[membership.playerSourceId]
    if (!clubId) unresolved.clubs.add(membership.clubSourceId)
    if (!playerId) unresolved.players.add(membership.playerSourceId)
    if (!clubId || !playerId) continue

    rows.push({
      playerId,
      clubId,
      season: membership.season,
      competition: membership.competition ?? undefined,
      games: membership.games,
    })
  }

  return { rows, unresolved }
}

/**
 * Turns the dataset's (player, club, season) rows into memberships.
 *
 * No progress file of its own — the writes are upserts keyed on (player_id, club_id, season),
 * so re-running simply rewrites the same rows.
 */
export async function seedMemberships(
  db: SupabaseClient,
  sport: SportId,
  memberships: SeedMembership[],
  { dryRun }: SeedOptions,
) {
  const paths = seededIdPaths(sport)
  const clubIds = loadSeededIds(paths.clubs)
  const playerIds = loadSeededIds(paths.players)

  if (Object.keys(clubIds).length === 0)
    throw new Error(`No clubs in ${paths.clubs} — run "npm run seed:${sport}:clubs" first.`)
  if (Object.keys(playerIds).length === 0)
    throw new Error(`No players in ${paths.players} — run "npm run seed:${sport}:players" first.`)

  const { rows, unresolved } = resolveMembershipRows(memberships, clubIds, playerIds)

  if (unresolved.clubs.size > 0 || unresolved.players.size > 0) {
    console.warn(
      `Skipping rows with unresolved ids: ${unresolved.clubs.size} club(s), ${unresolved.players.size} player(s) ` +
        `not in the seeded id maps — re-run the clubs/players steps if this is unexpected.`,
    )
  }

  console.log(`${memberships.length} memberships in dataset, ${rows.length} resolved.`)

  if (dryRun) {
    console.log(`Done (dry run, no DB writes). would upsert=${rows.length}`)
    return
  }

  try {
    const written = await upsertMembershipsBulk(db, sport, rows)
    console.log(`Done. memberships upserted=${written}`)
  } catch (err) {
    throw new Error(`Failed to upsert memberships: ${err instanceof ServiceError ? err.message : String(err)}`)
  }
}
