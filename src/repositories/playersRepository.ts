import { SupabaseClient } from '@supabase/supabase-js'
import { PlayerId } from '@/domain/ids'
import { Player } from '@/domain/player'
import { SportId } from '@/domain/sport'
import { Nationality } from '@/domain/nationality'
import { fetchAllRows } from '@/lib/supabasePagination'

type PlayerRow = { id: string; name: string; sport: SportId; nationality: string | null }

const toPlayer = (row: PlayerRow): Player => ({
  id: PlayerId(row.id),
  name: row.name,
  sport: row.sport,
  nationality: row.nationality ? Nationality(row.nationality) : undefined,
})

export async function findById(db: SupabaseClient, id: PlayerId): Promise<Player | null> {
  const { data, error } = await db.from('players').select('id, name, sport, nationality').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toPlayer(data) : null
}

export async function listBySport(db: SupabaseClient, sport: SportId, query?: string): Promise<Player[]> {
  if (query) {
    const { data, error } = await db
      .from('players')
      .select('id, name, sport, nationality')
      .eq('sport', sport)
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(20)
    if (error) throw new Error(error.message)
    return (data ?? []).map(toPlayer)
  }

  // No filter — the caller wants the full sport roster (e.g. the game engine builds its
  // graph client-side), so this must page through rather than rely on a single unbounded
  // select, which PostgREST silently caps at 1000 rows.
  const rows = await fetchAllRows<PlayerRow>((from, to) =>
    db.from('players').select('id, name, sport, nationality').eq('sport', sport).order('name').order('id').range(from, to),
  )
  return rows.map(toPlayer)
}

export async function insert(db: SupabaseClient, player: Player): Promise<Player> {
  const { error } = await db
    .from('players')
    .insert({ id: player.id, name: player.name, sport: player.sport, nationality: player.nationality ?? null })
  if (error) throw new Error(error.message)
  return player
}
