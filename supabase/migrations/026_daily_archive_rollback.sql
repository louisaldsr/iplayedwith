-- Undoes 026_daily_archive.sql: back to 022's ranking and stats, with no `late` column.
--
-- Late results stay in `daily_results`; they are simply ranked and counted like on-time ones again.
-- Deploy a build that no longer reads `late` first — or at once: the current one reads it as absent
-- (on time) and keeps working.

BEGIN;

DROP FUNCTION public.daily_stats(text, uuid);
DROP FUNCTION public.daily_ranking(text, date);

CREATE FUNCTION public.daily_ranking(p_sport text, p_day date)
RETURNS TABLE (
  rank            bigint,
  visitor_id      uuid,
  username        text,
  outcome         text,
  score           integer,
  added           integer,
  needed          integer,
  attempts        integer,
  duration_ms     bigint,
  lives_lost      integer,
  links           integer,
  hints           integer,
  path_player_ids text[],
  finished_at     timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH finished AS (
    SELECT r.*,
           r.attempts - r.lives_lost AS added,
           c.optimal_links - 1       AS needed
      FROM daily_results r
      JOIN daily_challenges c USING (sport, day)
     WHERE r.sport = p_sport AND r.day = p_day AND r.outcome IS NOT NULL
  )
  SELECT CASE
           WHEN f.outcome = 'won'
             THEN rank() OVER (ORDER BY f.outcome = 'lost', f.added - f.needed, f.finished_at - f.started_at)
           ELSE count(*) FILTER (WHERE f.outcome = 'won') OVER () + 1
         END,
         f.visitor_id,
         v.username,
         f.outcome,
         CASE WHEN f.outcome = 'won' THEN f.added - f.needed END,
         f.added,
         f.needed,
         f.attempts,
         (extract(epoch FROM f.finished_at - f.started_at) * 1000)::bigint,
         f.lives_lost,
         f.links,
         cardinality(f.hint_player_ids),
         f.path_player_ids,
         f.finished_at
    FROM finished f
    LEFT JOIN visitors v ON v.id = f.visitor_id
   ORDER BY 1, f.finished_at;
$$;

CREATE FUNCTION public.daily_stats(p_sport text, p_visitor uuid)
RETURNS TABLE (
  day         date,
  outcome     text,
  added       integer,
  needed      integer,
  score       integer,
  duration_ms bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT r.day,
         r.outcome,
         r.attempts - r.lives_lost,
         c.optimal_links - 1,
         CASE WHEN r.outcome = 'won' THEN r.attempts - r.lives_lost - (c.optimal_links - 1) END,
         (extract(epoch FROM r.finished_at - r.started_at) * 1000)::bigint
    FROM daily_results r
    JOIN daily_challenges c USING (sport, day)
   WHERE r.sport = p_sport AND r.visitor_id = p_visitor
   ORDER BY r.day;
$$;

REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_stats(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_stats(text, uuid) TO service_role;

DROP FUNCTION public.challenge_day_of(timestamptz);

COMMIT;
