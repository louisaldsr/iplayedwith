-- Undoes 017_visitors.sql: back to 016's daily_ranking, without names.
--
-- DESTRUCTIVE: every visitor's name is lost, and a new draw would give them another one. Dump
-- them first if they matter:
--   SELECT * FROM visitors ORDER BY created_at;
--
-- Deploy a build that no longer calls `ensure_visitor` BEFORE running this — the current one only
-- logs the failure (Start still goes through), but every name drawn in between is lost.

BEGIN;

DROP FUNCTION public.daily_ranking(text, date);

CREATE FUNCTION public.daily_ranking(p_sport text, p_day date)
RETURNS TABLE (
  rank        bigint,
  visitor_id  uuid,
  attempts    integer,
  duration_ms bigint,
  lives_lost  integer,
  links       integer,
  hints       integer,
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
         cardinality(r.hint_player_ids),
         r.finished_at
    FROM daily_results r
   WHERE r.sport = p_sport AND r.day = p_day AND r.outcome = 'won'
   ORDER BY 1, r.finished_at;
$$;

REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;

DROP FUNCTION IF EXISTS public.ensure_visitor(uuid, text, text);
DROP TABLE IF EXISTS visitors;

COMMIT;
