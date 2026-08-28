import { SupabaseClient } from '@supabase/supabase-js'
import { ClubId, PlayerId } from '@/domain/ids'
import { Membership } from '@/domain/membership'
import { Season } from '@/domain/season'
import { SportId } from '@/domain/sport'
import { fetchAllRows } from '@/lib/supabasePagination'

type UpsertRow = { playerId: PlayerId; clubId: ClubId; season: Season; competition?: string }

export async function upsertMany(db: SupabaseClient, rows: UpsertRow[]): Promise<Membership[]> {
  const payload = rows.map((r) => ({
    player_id: r.playerId,
    club_id: r.clubId,
    season: r.season,
    competition: r.competition ?? null,
  }))

  const { data, error } = await db
    .from('memberships')
    .upsert(payload, { onConflict: 'player_id,club_id,season' })
    .select('player_id, club_id, season, competition')

  if (error) throw new Error(error.message)

  return (data ?? []).map((r) => ({
    playerId: PlayerId(r.player_id),
    clubId: ClubId(r.club_id),
    season: r.season as Season,
    competition: r.competition ?? undefined,
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

/** Scoped via the club's sport, since memberships itself carries no sport column. */
export async function listBySport(
  db: SupabaseClient,
  sport: SportId,
): Promise<Pick<Membership, 'playerId' | 'clubId' | 'season'>[]> {
  const rows = await fetchAllRows<{ player_id: string; club_id: string; season: string }>((from, to) =>
    db
      .from('memberships')
      .select('player_id, club_id, season, clubs!inner(sport)')
      .eq('clubs.sport', sport)
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
