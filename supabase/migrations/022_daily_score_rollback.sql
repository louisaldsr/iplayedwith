-- Undoes 022_daily_score.sql: back to 020's ranking by attempts, 015's record_daily_move, no stats.
--
-- DESTRUCTIVE: the winning chains recorded so far are lost. Dump them first if they matter:
--   SELECT sport, day, visitor_id, path_player_ids FROM daily_results WHERE path_player_ids IS NOT NULL;
--
-- Deploy a build that no longer passes `p_path` nor calls `daily_stats` BEFORE running this — the
-- current one would fail to record every daily move (logged, the moves themselves still pass).

BEGIN;

DROP FUNCTION public.daily_stats(text, uuid);
DROP FUNCTION public.daily_ranking(text, date);
DROP FUNCTION public.record_daily_move(text, date, uuid, text, text, boolean, integer, integer, text[]);

CREATE FUNCTION public.record_daily_move(
  p_sport text,
  p_day date,
  p_visitor uuid,
  p_player_a text,
  p_player_b text,
  p_costs_life boolean,
  p_links integer,
  p_max_lives integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM daily_challenges
     WHERE sport = p_sport AND day = p_day AND player_a_id = p_player_a AND player_b_id = p_player_b
  ) THEN
    RETURN;
  END IF;

  INSERT INTO daily_results (sport, day, visitor_id)
  VALUES (p_sport, p_day, p_visitor)
  ON CONFLICT DO NOTHING;

  UPDATE daily_results
     SET attempts    = attempts + 1,
         lives_lost  = lives_lost + p_costs_life::int,
         links       = p_links,
         outcome     = CASE
                         WHEN p_links IS NOT NULL THEN 'won'
                         WHEN lives_lost + p_costs_life::int >= p_max_lives THEN 'lost'
                       END,
         finished_at = CASE
                         WHEN p_links IS NOT NULL OR lives_lost + p_costs_life::int >= p_max_lives THEN now()
                       END
   WHERE sport = p_sport AND day = p_day AND visitor_id = p_visitor
     AND outcome IS NULL;
END;
$$;

CREATE FUNCTION public.daily_ranking(p_sport text, p_day date)
RETURNS TABLE (
  rank         bigint,
  visitor_id   uuid,
  username     text,
  attempts     integer,
  duration_ms  bigint,
  lives_lost   integer,
  links        integer,
  hints        integer,
  finished_at  timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT rank() OVER (ORDER BY r.attempts, r.finished_at - r.started_at),
         r.visitor_id,
         v.username,
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

REVOKE EXECUTE ON FUNCTION public.record_daily_move(text, date, uuid, text, text, boolean, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_move(text, date, uuid, text, text, boolean, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;

DROP INDEX daily_results_visitor_idx;
ALTER TABLE daily_results DROP COLUMN path_player_ids;

COMMIT;
