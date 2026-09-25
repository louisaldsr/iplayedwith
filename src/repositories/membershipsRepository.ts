import { SupabaseClient } from '@supabase/supabase-js'
import { ClubId, PlayerId } from '@/domain/ids'
import { Membership } from '@/domain/membership'
import { Season } from '@/domain/season'
import { SportId } from '@/domain/sport'
import { fetchAllRows } from '@/lib/supabasePagination'

type UpsertRow = {
  playerId: PlayerId
  clubId: ClubId
  season: Season
  sport: SportId
  competition?: string
  games?: number | null
}

/**
 * Upserts on (player_id, club_id, season).
 *
 * `games` is written only for the rows that carry the key. An upsert updates exactly the
 * columns present in its payload, so a row sent WITHOUT `games` keeps its stored value — which
 * is what stops a writer that knows nothing about games (the admin form) from erasing what an
 * import wrote. Rows with and without the key are therefore sent as two separate requests:
 * mixed in one payload, PostgREST would fill the missing key with NULL.
 */
export async function upsertMany(db: SupabaseClient, rows: UpsertRow[]): Promise<Membership[]> {
  const withGames = rows.filter((r) => r.games !== undefined)
  const withoutGames = rows.filter((r) => r.games === undefined)

  const written: Membership[] = []
  for (const group of [withGames, withoutGames]) {
    if (group.length === 0) continue
    written.push(...(await upsertGroup(db, group)))
  }
  return written
}

async function upsertGroup(db: SupabaseClient, rows: UpsertRow[]): Promise<Membership[]> {
  const payload = rows.map((r) => ({
    player_id: r.playerId,
    club_id: r.clubId,
    season: r.season,
    sport: r.sport,
    competition: r.competition ?? null,
    ...(r.games !== undefined && { games: r.games }),
  }))

  const { data, error } = await db
    .from('memberships')
    .upsert(payload, { onConflict: 'player_id,club_id,season' })
    .select('player_id, club_id, season, competition, games')

  if (error) throw new Error(error.message)

  return (data ?? []).map((r) => ({
    playerId: PlayerId(r.player_id),
    clubId: ClubId(r.club_id),
    season: r.season as Season,
    competition: r.competition ?? undefined,
    games: r.games,
  }))
}

export async function deleteOne(db: SupabaseClient, playerId: PlayerId, clubId: ClubId, season: Season): Promise<void> {
  const { error } = await db
    .from('memberships')
    .delete()
    .eq('player_id', playerId)
    .eq('club_id', clubId)
    .eq('season', season)

  if (error) throw new Error(error.message)
}

/**
 * The whole sport-scoped table, paged. Server-side only — seed imports use it to
 * reconcile against what is already stored. The game never calls this: it would be
 * ~41k rows for football, and `listForPlayers` covers what a move actually needs.
 */
export async function listBySport(
  db: SupabaseClient,
  sport: SportId,
): Promise<Pick<Membership, 'playerId' | 'clubId' | 'season'>[]> {
  const rows = await fetchAllRows<{ player_id: string; club_id: string; season: string }>((from, to) =>
    db
      .from('memberships')
      .select('player_id, club_id, season')
      .eq('sport', sport)
      .order('player_id')
      .order('club_id')
      .order('season')
      .range(from, to),
  )

  return rows.map((m) => ({
    playerId: PlayerId(m.player_id),
    clubId: ClubId(m.club_id),
    season: m.season as Season,
  }))
}

/**
 * Every membership held by any of `playerIds`, within one sport.
 *
 * This is the whole data dependency of a single game move: the engine only ever reads
 * memberships of players already in the graph plus the one being submitted. With
 * `memberships_sport_player_idx` that is one indexed lookup returning a few hundred rows,
 * instead of the ~41k-row full-table load the client used to do up front.
 */
export async function listForPlayers(
  db: SupabaseClient,
  sport: SportId,
  playerIds: PlayerId[],
): Promise<Pick<Membership, 'playerId' | 'clubId' | 'season'>[]> {
  if (playerIds.length === 0) return []

  const { data, error } = await db
    .from('memberships')
    .select('player_id, club_id, season')
    .eq('sport', sport)
    .in('player_id', [...new Set(playerIds)])

  if (error) throw new Error(error.message)

  return (data ?? []).map((m) => ({
    playerId: PlayerId(m.player_id),
    clubId: ClubId(m.club_id),
    season: m.season as Season,
  }))
}

/** Distinct seasons a club has a roster for, most recent first. Drives the hard-mode season chips. */
export async function listSeasonsByClub(db: SupabaseClient, clubId: ClubId): Promise<Season[]> {
  const { data, error } = await db.from('memberships').select('season').eq('club_id', clubId)
  if (error) throw new Error(error.message)

  const seasons = new Set((data ?? []).map((r) => r.season as Season))
  return [...seasons].sort((a, b) => Number(b.slice(0, 4)) - Number(a.slice(0, 4)))
}

export async function listByPlayer(
  db: SupabaseClient,
  playerId: PlayerId,
): Promise<Pick<Membership, 'clubId' | 'season'>[]> {
  const { data, error } = await db.from('memberships').select('club_id, season').eq('player_id', playerId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((m) => ({ clubId: ClubId(m.club_id), season: m.season as Season }))
}

/** All (player, season) rows for a club, with player names joined in — used to list seasons already entered. */
export async function listByClub(
  db: SupabaseClient,
  clubId: ClubId,
): Promise<{ playerId: PlayerId; playerName: string; season: Season }[]> {
  const { data, error } = await db
    .from('memberships')
    .select('player_id, season, players!inner(name)')
    .eq('club_id', clubId)

  if (error) throw new Error(error.message)

  return (data as unknown as { player_id: string; season: string; players: { name: string } }[]).map((r) => ({
    playerId: PlayerId(r.player_id),
    playerName: r.players.name,
    season: r.season as Season,
  }))
}

/** A club's roster for one season, with player names joined in. */
export async function listByClubAndSeason(
  db: SupabaseClient,
  clubId: ClubId,
  season: Season,
): Promise<{ playerId: PlayerId; playerName: string }[]> {
  const { data, error } = await db
    .from('memberships')
    .select('player_id, players!inner(name)')
    .eq('club_id', clubId)
    .eq('season', season)

  if (error) throw new Error(error.message)

  return (data as unknown as { player_id: string; players: { name: string } }[]).map((r) => ({
    playerId: PlayerId(r.player_id),
    playerName: r.players.name,
  }))
}

/** Returns the subset of `playerIds` that have the exact (clubId, season) membership. */
export async function hasExactForAny(
  db: SupabaseClient,
  playerIds: PlayerId[],
  clubId: ClubId,
  season: Season,
): Promise<PlayerId[]> {
  const { data, error } = await db
    .from('memberships')
    .select('player_id')
    .in('player_id', playerIds)
    .eq('club_id', clubId)
    .eq('season', season)

  if (error) throw new Error(error.message)
  return (data ?? []).map((m) => PlayerId(m.player_id))
}
