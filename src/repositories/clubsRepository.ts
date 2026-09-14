import { Club } from '@/domain/club';
import { ClubId } from '@/domain/ids';
import { SportId } from '@/domain/sport';
import { fetchAllRows } from '@/lib/supabasePagination';
import { SupabaseClient } from '@supabase/supabase-js';

type ClubRow = {
  id: string;
  name: string;
  sport: SportId;
  logo_url?: string | null;
};

const toClub = (row: ClubRow): Club => ({
  id: ClubId(row.id),
  name: row.name,
  sport: row.sport,
  logoUrl: row.logo_url ?? undefined,
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

export async function findByNameAndSport(
  db: SupabaseClient,
  name: string,
  sport: SportId,
): Promise<Club | null> {
  const { data, error } = await db
    .from('clubs')
    .select('id, name, sport, logo_url')
    .eq('sport', sport)
    .ilike('name', name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toClub(data) : null;
}

export async function listBySport(
  db: SupabaseClient,
  sport: SportId,
  query?: string,
): Promise<Club[]> {
  if (query) {
    const { data, error } = await db
      .from('clubs')
      .select('id, name, sport, logo_url')
      .eq('sport', sport)
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toClub);
  }

  // No filter — full sport roster for client-side use; page through rather than rely on
  // a single unbounded select, which PostgREST silently caps at 1000 rows.
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
