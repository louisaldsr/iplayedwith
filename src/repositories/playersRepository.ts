import { SupabaseClient } from '@supabase/supabase-js'
import { PlayerId } from '@/domain/ids'
import { Player } from '@/domain/player'
import { SportId } from '@/domain/sport'
import { Nationality } from '@/domain/nationality'
import { FameDetails, ImportedFameDetails, parseFameDetails } from '@/domain/fame'
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
    db
      .from('players')
      .select('id, name, sport, nationality')
      .eq('sport', sport)
      .order('name')
      .order('id')
      .range(from, to),
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

/** Rows per RPC call — same reasoning as INSERT_CHUNK_SIZE, applied to a jsonb payload. */
const FAME_CHUNK_SIZE = 1000

export type FameDetailsRow = { playerId: PlayerId; details: ImportedFameDetails }

/**
 * Writes the raw fame signals an import produced, merging them into each player's existing
 * bag rather than replacing it.
 *
 * Goes through the `apply_fame_details` SQL function rather than the query builder. PostgREST
 * has no bulk update: the alternative is one request per player (tens of thousands) or an
 * `upsert`, and an upsert here would have to restate `name` and `sport` on every row — so a
 * stale import would silently overwrite a player's identity with what it happens to believe.
 *
 * Note what is NOT here: nothing recomputes the score afterwards. `players.fame` is a
 * generated column, so it is recalculated by this very statement.
 * See supabase/migrations/010_player_fame.sql.
 */
export async function applyFameDetails(db: SupabaseClient, sport: SportId, rows: FameDetailsRow[]): Promise<number> {
  let updated = 0
  for (let i = 0; i < rows.length; i += FAME_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + FAME_CHUNK_SIZE)
    const { data, error } = await db.rpc('apply_fame_details', {
      p_sport: sport,
      p_rows: chunk.map((row) => ({ player_id: row.playerId, details: row.details })),
    })
    if (error) throw new Error(error.message)
    updated += typeof data === 'number' ? data : 0
  }
  return updated
}

/**
 * Recounts each player's distinct seasons from `memberships` and writes them into the bag.
 *
 * Separate from `applyFameDetails` because the two have different sources: an import knows a
 * player's match and cap counts, but the season count belongs to the memberships table — the
 * very data the game's graph is built from, so deriving it here keeps the two from diverging.
 * Run it after memberships land.
 */
export async function refreshFameSeasons(db: SupabaseClient, sport: SportId): Promise<number> {
  const { data, error } = await db.rpc('refresh_fame_seasons', { p_sport: sport })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}

export type PlayerFame = {
  id: PlayerId
  name: string
  fame: number | null
  details: FameDetails
}

/**
 * The whole sport's scores, for the `fame:report` CLI.
 *
 * Server-side callers only, like `listBySport` — this is the one read path that exists for
 * fame, and it exists so the metric can be eyeballed before the game depends on it.
 */
export async function listFameBySport(db: SupabaseClient, sport: SportId): Promise<PlayerFame[]> {
  type Row = { id: string; name: string; fame: number | null; fame_details: unknown }
  const rows = await fetchAllRows<Row>((from, to) =>
    db.from('players').select('id, name, fame, fame_details').eq('sport', sport).order('id').range(from, to),
  )
  return rows.map((row) => ({
    id: PlayerId(row.id),
    name: row.name,
    fame: row.fame,
    details: parseFameDetails(row.fame_details),
  }))
}
