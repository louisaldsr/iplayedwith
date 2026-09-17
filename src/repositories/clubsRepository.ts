import { Club, ClubSearchResult } from '@/domain/club';
import { ClubId } from '@/domain/ids';
import { SportId } from '@/domain/sport';
import { fetchAllRows } from '@/lib/supabasePagination';
import { normalizeSearch } from '@/lib/searchNormalize';
import { SupabaseClient } from '@supabase/supabase-js';

type ClubRow = {
  id: string;
  name: string;
  sport: SportId;
  logo_url?: string | null;
};

/** What `search_clubs()` returns — a club row plus the alias that matched, if any. */
type ClubSearchRow = ClubRow & { matched_alias: string | null };

const toClub = (row: ClubRow): Club => ({
  id: ClubId(row.id),
  name: row.name,
  sport: row.sport,
  logoUrl: row.logo_url ?? undefined,
});

const toSearchResult = (row: ClubSearchRow): ClubSearchResult => ({
  ...toClub(row),
  matchedAlias: row.matched_alias ?? undefined,
});

export async function findManyByIds(
  db: SupabaseClient,
  ids: ClubId[],
): Promise<Club[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from('clubs')
    .select('id, name, sport, logo_url')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toClub);
}

export async function findById(db: SupabaseClient, id: ClubId): Promise<Club | null> {
  const { data, error } = await db
    .from('clubs')
    .select('id, name, sport, logo_url')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toClub(data) : null;
}

/**
 * Exact name lookup within a sport, compared on the normalized form — so "Stade
 * Rochelais", "stade rochelais" and "Stade  Rochelais" are one club, not three. This is
 * the duplicate guard a seed import re-attaching to its own clubs relies on.
 */
export async function findByNameAndSport(
  db: SupabaseClient,
  name: string,
  sport: SportId,
): Promise<Club | null> {
  const { data, error } = await db
    .from('clubs')
    .select('id, name, sport, logo_url')
    .eq('sport', sport)
    .eq('search_name', normalizeSearch(name))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toClub(data) : null;
}

/**
 * Typeahead search, capped at 20 and ranked by relevance.
 *
 * Goes through the `search_clubs` SQL function rather than the query builder: PostgREST
 * can express neither the union of club names with their aliases (so "la roch" finds the
 * Stade Rochelais) nor an ORDER BY computed from the query. Matching is accent- and
 * punctuation-insensitive — see supabase/migrations/008_search_normalization.sql.
 */
export async function searchBySport(
  db: SupabaseClient,
  sport: SportId,
  query: string,
): Promise<ClubSearchResult[]> {
  const { data, error } = await db.rpc('search_clubs', {
    p_sport: sport,
    p_q: query,
    p_limit: 20,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ClubSearchRow[]).map(toSearchResult);
}

export async function listBySport(db: SupabaseClient, sport: SportId): Promise<Club[]> {
  // The full sport club list, paged because PostgREST silently caps an unbounded select
  // at 1000 rows. Server-side callers only (seed imports); the API rejects a query-less
  // request so this never reaches a browser. Searching is `searchBySport`.
  const rows = await fetchAllRows<ClubRow>((from, to) =>
    db
      .from('clubs')
      .select('id, name, sport, logo_url')
      .eq('sport', sport)
      .order('name')
      .order('id')
      .range(from, to),
  );
  return rows.map(toClub);
}

export async function insert(db: SupabaseClient, club: Club): Promise<Club> {
  const { error } = await db
    .from('clubs')
    .insert({
      id: club.id,
      name: club.name,
      sport: club.sport,
      logo_url: club.logoUrl ?? null,
    });
  if (error) throw new Error(error.message);
  return club;
}
