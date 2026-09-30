-- Undoes 016_daily_hints.sql: back to 015's daily_ranking, without hints.
--
-- DESTRUCTIVE: the hints recorded so far are lost. Dump them first if they matter:
--   SELECT sport, day, visitor_id, hint_player_ids FROM daily_results WHERE hint_player_ids <> '{}';
--
-- Deploy a build that no longer calls `record_daily_hint` BEFORE running this — the current one
-- would only log the failures, but the ranking script expects the `hints` column.

BEGIN;

DROP FUNCTION IF EXISTS public.record_daily_hint(text, date, uuid, text);
DROP FUNCTION public.daily_ranking(text, date);

CREATE FUNCTION public.daily_ranking(p_sport text, p_day date)
RETURNS TABLE (
  rank        bigint,
  visitor_id  uuid,
  attempts    integer,
  duration_ms bigint,
  lives_lost  integer,
  links       integer,
  finished_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT rank() OVER (ORDER BY r.attempts, r.finished_at - r.started_at),
         r.visitor_id,
         r.attempts,
         (extract(epoch FROM r.finished_at - r.started_at) * 1000)::bigint,
         r.lives_lost,
         r.links,
         r.finished_at
    FROM daily_results r
   WHERE r.sport = p_sport AND r.day = p_day AND r.outcome = 'won'
   ORDER BY 1, r.finished_at;
$$;

REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;

ALTER TABLE daily_results DROP COLUMN hint_player_ids;

COMMIT;
