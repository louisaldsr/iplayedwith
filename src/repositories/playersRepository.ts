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

export async function findManyByIds(db: SupabaseClient, ids: PlayerId[]): Promise<Player[]> {
  if (ids.length === 0) return []
  const { data, error } = await db
    .from('players')
    .select('id, name, sport, nationality')
    .in('id', [...new Set(ids)])
  if (error) throw new Error(error.message)
  return (data ?? []).map(toPlayer)
}

/**
 * A uniformly random player from the sport, picked by offset over the row count.
 *
 * Two cheap queries beat the alternatives: `ORDER BY random()` sorts the whole table,
 * and picking client-side would mean shipping the roster — the very thing this change
 * exists to stop.
 */
export async function findRandom(db: SupabaseClient, sport: SportId, excludeId?: PlayerId): Promise<Player | null> {
  const { count, error: countError } = await db
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('sport', sport)
  if (countError) throw new Error(countError.message)
  if (!count) return null

  const pick = async (offset: number): Promise<Player | null> => {
    const { data, error } = await db
      .from('players')
      .select('id, name, sport, nationality')
      .eq('sport', sport)
      .order('id')
      .range(offset, offset)
    if (error) throw new Error(error.message)
    return data?.[0] ? toPlayer(data[0]) : null
  }

  const offset = Math.floor(Math.random() * count)
  const player = await pick(offset)

  // Landing on the excluded player: step to the next row rather than re-rolling, so this
  // always terminates. Ordering by id makes "next" stable.
  if (player && excludeId && player.id === excludeId) {
    if (count === 1) return null
    return pick((offset + 1) % count)
  }

  return player
}

/**
 * Typeahead search, capped at 20 and ranked by relevance.
 *
 * Goes through the `search_players` SQL function rather than the query builder, so that
 * matching can be accent- and punctuation-insensitive ("gael fickou" finds "Gaël Fickou")
 * and exact-then-prefix matches can be ordered ahead of mid-string ones — neither is
 * expressible in PostgREST. See supabase/migrations/008_search_normalization.sql.
 */
export async function searchBySport(db: SupabaseClient, sport: SportId, query: string): Promise<Player[]> {
  const { data, error } = await db.rpc('search_players', { p_sport: sport, p_q: query, p_limit: 20 })
  if (error) throw new Error(error.message)
  return ((data ?? []) as PlayerRow[]).map(toPlayer)
}

export async function listBySport(db: SupabaseClient, sport: SportId): Promise<Player[]> {
  // The full sport roster, paged because PostgREST silently caps an unbounded select at
  // 1000 rows. Server-side callers only (seed imports); the API rejects a query-less
  // request so this never reaches a browser. Searching is `searchBySport`.
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

/** Rows per insert request — a seed import creates players in the tens of thousands, and one request each is far too many round-trips. */
const INSERT_CHUNK_SIZE = 500

/**
 * Bulk counterpart to `insert`, for seed imports. Chunks the rows so a single request
 * never carries an unbounded payload; chunks are sent in order, so a mid-run failure
 * leaves every earlier chunk committed and the caller can resume from its own progress
 * file rather than redoing the whole import.
 */
export async function insertMany(db: SupabaseClient, players: Player[]): Promise<Player[]> {
  for (let i = 0; i < players.length; i += INSERT_CHUNK_SIZE) {
    const chunk = players.slice(i, i + INSERT_CHUNK_SIZE)
    const { error } = await db.from('players').insert(
      chunk.map((player) => ({
        id: player.id,
        name: player.name,
        sport: player.sport,
        nationality: player.nationality ?? null,
      })),
    )
    if (error) throw new Error(error.message)
  }
  return players
}
