import { SupabaseClient } from '@supabase/supabase-js'
import { PlayerId } from '@/domain/ids'
import { Player } from '@/domain/player'
import { SportId } from '@/domain/sport'
import { Nationality } from '@/domain/nationality'
import { FameBand } from '@/domain/drawFameBand'
import {
  FameDetails,
  FameTerms,
  ImportedExposureDetails,
  ImportedFameDetails,
  parseFameDetails,
  parseFameTerms,
} from '@/domain/fame'
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

  return pickByOffset(
    count,
    async (offset) => {
      const { data, error } = await db
        .from('players')
        .select('id, name, sport, nationality')
        .eq('sport', sport)
        .order('id')
        .range(offset, offset)
      if (error) throw new Error(error.message)
      return data?.[0] ? toPlayer(data[0]) : null
    },
    excludeId,
  )
}

/**
 * A uniformly random player among those whose fame score lies in `band` (inclusive), by the
 * same offset pick as `findRandom`, read from `player_fame` — its (sport, score) index exists
 * for this.
 *
 * Null when the band holds fewer than 2 players (scores not computed yet): one player cannot
 * fill both slots of a game, so the caller falls back to `findRandom` rather than serve the
 * same name every time.
 */
export async function findRandomInFameBand(
  db: SupabaseClient,
  sport: SportId,
  band: FameBand,
  excludeId?: PlayerId,
): Promise<Player | null> {
  const { count, error: countError } = await db
    .from('player_fame')
    .select('player_id', { count: 'exact', head: true })
    .eq('sport', sport)
    .gte('score', band.min)
    .lte('score', band.max)
  if (countError) throw new Error(countError.message)
  if (!count || count < 2) return null

  return pickByOffset(
    count,
    async (offset) => {
      const { data, error } = await db
        .from('player_fame')
        .select('players(id, name, sport, nationality)')
        .eq('sport', sport)
        .gte('score', band.min)
        .lte('score', band.max)
        .order('player_id')
        .range(offset, offset)
      if (error) throw new Error(error.message)
      // Many-to-one through the (player_id, sport) FK: PostgREST embeds an object. Without
      // generated types supabase-js cannot know that and types every embed as an array.
      const row = data?.[0] as unknown as { players: PlayerRow | null } | undefined
      return row?.players ? toPlayer(row.players) : null
    },
    excludeId,
  )
}

async function pickByOffset(
  count: number,
  pick: (offset: number) => Promise<Player | null>,
  excludeId?: PlayerId,
): Promise<Player | null> {
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

export type FameDetailsRow = { playerId: PlayerId; details: ImportedFameDetails | ImportedExposureDetails }

/**
 * Writes the raw fame signals an import produced, merging them into each player's existing
 * bag rather than replacing it.
 *
 * Goes through the `apply_fame_details` SQL function rather than the query builder. PostgREST
 * has no bulk update: the alternative is one request per player (tens of thousands) or an
 * `upsert`, and an upsert here would have to restate `name` and `sport` on every row — so a
 * stale import would silently overwrite a player's identity with what it happens to believe.
 *
 * Note what is NOT here: nothing computes the score. That is `computeFameScores`, a separate
 * call — the score also reads `memberships`, which this write knows nothing about.
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
 * Recomputes `player_fame.score` (and its `terms`) for every player of the sport: longevity from
 * `memberships.games`, club performance from starts/minutes and the season prestige — which the
 * SQL function rescores first — international performance from `details.capsByNation`, exposure
 * from `details.viewsPerYear`. Returns the number of players scored.
 *
 * The formula and its per-sport constants live only in SQL — see
 * supabase/migrations/025_fame_v3.sql. One call rewrites the whole sport, so a partial run
 * cannot leave it on two revisions.
 */
export async function computeFameScores(db: SupabaseClient, sport: SportId): Promise<number> {
  const { data, error } = await db.rpc('compute_fame_scores', { p_sport: sport })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}

/**
 * Replaces every nation tier `source` owns in the sport (`replace_nation_tiers`, 025): the
 * football import writes them from the dataset's FIFA ranking on each run. Returns rows written.
 */
export async function replaceNationTiers(
  db: SupabaseClient,
  sport: SportId,
  source: string,
  rows: { nation: string; weight: number }[],
): Promise<number> {
  const { data, error } = await db.rpc('replace_nation_tiers', { p_sport: sport, p_source: source, p_rows: rows })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}

/**
 * One player's `player_fame.score`, or null when it is not computed yet (or the player has no
 * fame row at all). Read by a move to give the added node its floor.
 */
export async function findFameScore(db: SupabaseClient, sport: SportId, id: PlayerId): Promise<number | null> {
  const { data, error } = await db
    .from('player_fame')
    .select('score')
    .eq('sport', sport)
    .eq('player_id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.score ?? null
}

export type PlayerFame = {
  id: PlayerId
  name: string
  /** `player_fame.score`, NULL until `compute_fame_scores` has run for the sport. */
  score: number | null
  /** Formula revision the score was computed with; NULL exactly when `score` is. */
  revision: number | null
  details: FameDetails
  /** Sum of `memberships.games`; null when no membership of this player has a count. */
  games: number | null
  /** Distinct seasons across the player's memberships; 0 means unreachable in any puzzle. */
  seasons: number
  /** The four pillars `compute_fame_scores` wrote with the score; null before revision 3. */
  terms: FameTerms | null
}

/**
 * The whole sport's signals and scores, for the `fame:report` CLI.
 *
 * Server-side callers only, like `listBySport` — this is the one read path that exists for
 * fame, and it exists so the metric can be eyeballed before the game depends on it.
 *
 * Separate queries joined in memory rather than PostgREST embeds: the links to `players` are
 * COMPOSITE foreign keys on (player_id, sport), which embedding can only follow with an
 * explicit constraint hint and is easy to get subtly wrong. This runs from a CLI, a handful of
 * times a year, so the extra round trips buy certainty cheaply.
 *
 * Games and seasons are aggregated here from `memberships`, the same way the score will read
 * them — never from `details`, which does not carry them.
 *
 * Driven from `players`: a player with no signals row or no memberships is exactly what the
 * report needs to count, and starting from either other table would hide them.
 */
export async function listFameBySport(db: SupabaseClient, sport: SportId): Promise<PlayerFame[]> {
  type PlayerRow = { id: string; name: string }
  type FameRow = { player_id: string; score: number | null; revision: number | null; details: unknown; terms: unknown }
  type MembershipRow = { player_id: string; season: string; games: number | null }

  const [players, fame, memberships] = await Promise.all([
    fetchAllRows<PlayerRow>((from, to) =>
      db.from('players').select('id, name').eq('sport', sport).order('id').range(from, to),
    ),
    fetchAllRows<FameRow>((from, to) =>
      db
        .from('player_fame')
        .select('player_id, score, revision, details, terms')
        .eq('sport', sport)
        .order('player_id')
        .range(from, to),
    ),
    fetchAllRows<MembershipRow>((from, to) =>
      db
        .from('memberships')
        .select('player_id, season, games')
        .eq('sport', sport)
        .order('player_id')
        .order('club_id')
        .order('season')
        .range(from, to),
    ),
  ])

  const signalsByPlayerId = new Map(fame.map((row) => [row.player_id, row]))

  const careerByPlayerId = new Map<string, { games: number | null; seasons: Set<string> }>()
  for (const m of memberships) {
    const career = careerByPlayerId.get(m.player_id) ?? { games: null, seasons: new Set<string>() }
    if (m.games !== null) career.games = (career.games ?? 0) + m.games
    career.seasons.add(m.season)
    careerByPlayerId.set(m.player_id, career)
  }

  return players.map((row) => {
    const signals = signalsByPlayerId.get(row.id)
    const career = careerByPlayerId.get(row.id)
    return {
      id: PlayerId(row.id),
      name: row.name,
      score: signals?.score ?? null,
      revision: signals?.revision ?? null,
      details: parseFameDetails(signals?.details),
      games: career?.games ?? null,
      seasons: career?.seasons.size ?? 0,
      terms: parseFameTerms(signals?.terms),
    }
  })
}
