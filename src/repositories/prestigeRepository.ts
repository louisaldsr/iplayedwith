import { SupabaseClient } from '@supabase/supabase-js'
import { ClubId } from '@/domain/ids'
import { ContinentalWins, PrestigeDetails, parsePrestigeDetails } from '@/domain/prestige'
import { Season } from '@/domain/season'
import { SportId } from '@/domain/sport'
import { fetchAllRows } from '@/lib/supabasePagination'

export type ContinentalWinsRow = { clubId: ClubId; season: Season; wins: ContinentalWins }
export type ClubTitleRow = { clubId: ClubId; season: Season; competition: string }

/**
 * Replaces the continental runs of the whole sport, in ONE call: `replace_continental_wins`
 * first clears every run, then writes these — so a run an import no longer finds is back to 0.
 * A club-season has at most a few hundred bytes here, and a sport is a few thousand of them,
 * so one payload is fine; batching would break the "whole sport at once" guarantee.
 *
 * Returns the rows written. Rows for a club-season with no membership are skipped by the
 * function (see supabase/migrations/023_season_prestige.sql).
 */
export async function replaceContinentalWins(
  db: SupabaseClient,
  sport: SportId,
  rows: ContinentalWinsRow[],
): Promise<number> {
  const { data, error } = await db.rpc('replace_continental_wins', {
    p_sport: sport,
    p_rows: rows.map((row) => ({ club_id: row.clubId, season: row.season, wins: row.wins })),
  })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}

/**
 * Replaces every title `source` owns in the sport, in one call. Titles of another source (the
 * curated rugby seed) are left alone. Returns the rows written; unknown clubs or competitions
 * are skipped by the function.
 */
export async function replaceClubTitles(
  db: SupabaseClient,
  sport: SportId,
  source: string,
  rows: ClubTitleRow[],
): Promise<number> {
  const { data, error } = await db.rpc('replace_club_titles', {
    p_sport: sport,
    p_source: source,
    p_rows: rows.map((row) => ({ club_id: row.clubId, season: row.season, competition: row.competition })),
  })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}

export type SeasonPrestige = {
  clubId: ClubId
  clubName: string
  season: string
  /** `club_season_prestige.score`, NULL until computed or once the club-season left the graph. */
  score: number | null
  revision: number | null
  details: PrestigeDetails
  /** Competitions this squad won, from `club_titles`. */
  titles: string[]
}

export type PrestigeCompetition = { competition: string; winsWeight: number; titleWeight: number }

/**
 * Every club-season of the sport with its signals and score, for the `prestige:report` CLI —
 * the one read path of the table, so the metric can be eyeballed by name.
 *
 * Separate queries joined in memory, for the same reason as `listFameBySport`: the links are
 * composite foreign keys that PostgREST embeds follow badly, and this runs a few times a year.
 */
export async function listSeasonPrestige(db: SupabaseClient, sport: SportId): Promise<SeasonPrestige[]> {
  type ClubRow = { id: string; name: string }
  type PrestigeRow = {
    club_id: string
    season: string
    score: number | null
    revision: number | null
    details: unknown
  }
  type TitleRow = { club_id: string; season: string; competition: string }

  const [clubs, prestige, titles] = await Promise.all([
    fetchAllRows<ClubRow>((from, to) =>
      db.from('clubs').select('id, name').eq('sport', sport).order('id').range(from, to),
    ),
    fetchAllRows<PrestigeRow>((from, to) =>
      db
        .from('club_season_prestige')
        .select('club_id, season, score, revision, details')
        .eq('sport', sport)
        .order('club_id')
        .order('season')
        .range(from, to),
    ),
    fetchAllRows<TitleRow>((from, to) =>
      db
        .from('club_titles')
        .select('club_id, season, competition')
        .eq('sport', sport)
        .order('competition')
        .order('season')
        .range(from, to),
    ),
  ])

  const nameById = new Map(clubs.map((c) => [c.id, c.name]))
  const titlesByClubSeason = new Map<string, string[]>()
  for (const t of titles) {
    const key = `${t.club_id}||${t.season}`
    titlesByClubSeason.set(key, [...(titlesByClubSeason.get(key) ?? []), t.competition])
  }

  return prestige.map((row) => ({
    clubId: ClubId(row.club_id),
    clubName: nameById.get(row.club_id) ?? row.club_id,
    season: row.season,
    score: row.score,
    revision: row.revision,
    details: parsePrestigeDetails(row.details),
    titles: titlesByClubSeason.get(`${row.club_id}||${row.season}`) ?? [],
  }))
}

export async function listPrestigeCompetitions(db: SupabaseClient, sport: SportId): Promise<PrestigeCompetition[]> {
  const { data, error } = await db
    .from('prestige_competitions')
    .select('competition, wins_weight, title_weight')
    .eq('sport', sport)
    .order('competition')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    competition: row.competition,
    winsWeight: Number(row.wins_weight),
    titleWeight: Number(row.title_weight),
  }))
}

/** Every title of the sport, for the report's per-competition coverage. */
export async function listClubTitles(
  db: SupabaseClient,
  sport: SportId,
): Promise<{ competition: string; season: string; clubId: string; source: string }[]> {
  const { data, error } = await db
    .from('club_titles')
    .select('competition, season, club_id, source')
    .eq('sport', sport)
    .order('competition')
    .order('season')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    competition: row.competition,
    season: row.season,
    clubId: row.club_id,
    source: row.source,
  }))
}
