-- Undoes 018_visitor_number.sql: back to 017's names without a number.
--
-- The numbers are lost (names become shared again). Dump them first if they matter:
--   SELECT id, name_number FROM visitors;
--
-- Deploy a build that no longer reads `name_number` BEFORE running this.

BEGIN;

DROP FUNCTION public.daily_ranking(text, date);

CREATE FUNCTION public.daily_ranking(p_sport text, p_day date)
RETURNS TABLE (
  rank            bigint,
  visitor_id      uuid,
  name_adjective  text,
  name_noun       text,
  attempts        integer,
  duration_ms     bigint,
  lives_lost      integer,
  links           integer,
  hints           integer,
  finished_at     timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT rank() OVER (ORDER BY r.attempts, r.finished_at - r.started_at),
         r.visitor_id,
         v.name_adjective,
         v.name_noun,
         r.attempts,
         (extract(epoch FROM r.finished_at - r.started_at) * 1000)::bigint,
         r.lives_lost,
         r.links,
         cardinality(r.hint_player_ids),
         r.finished_at
    FROM daily_results r
    LEFT JOIN visitors v ON v.id = r.visitor_id
   WHERE r.sport = p_sport AND r.day = p_day AND r.outcome = 'won'
   ORDER BY 1, r.finished_at;
$$;

DROP FUNCTION public.ensure_visitor(uuid, text, text);

CREATE FUNCTION public.ensure_visitor(p_id uuid, p_name_adjective text, p_name_noun text)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO visitors (id, name_adjective, name_noun)
  VALUES (p_id, p_name_adjective, p_name_noun)
  ON CONFLICT (id) DO NOTHING;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_visitor(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_visitor(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;

DROP INDEX IF EXISTS visitors_name_key;
ALTER TABLE visitors DROP COLUMN name_number;

COMMIT;
