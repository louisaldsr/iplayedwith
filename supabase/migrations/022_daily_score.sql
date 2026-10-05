-- The daily score — the extra players — and each visitor's stats.
--
-- ─── The score ────────────────────────────────────────────────────────────────
--
--   added  = attempts − lives_lost    — the players added to the board
--   needed = optimal_links − 1        — the fewest players that connect A and B
--   score  = added − needed           — "Perfect!", "+1", "+2"…, never negative, no limit
--
-- Every player added counts, on the winning chain or not: a dead end costs as much as a detour,
-- so adding players never pays. A guess linked to nobody costs a life, never a point — lives
-- decide whether the day is won, the score how well. Time is not in the score.
--
-- ⚠️ Written twice: here and in src/domain/dailyScore.ts. Change both.
--
-- ─── The ranking ──────────────────────────────────────────────────────────────
--
-- Every finished row: winners by score, then time (finished_at − started_at), ties sharing a rank;
-- then everyone who lost, all on the rank after the last winner — nothing orders them, they have
-- no chain. Rows still being played are not listed. Lives left and hints are shown, not ranked.
--
-- v1 (015) ranked by attempts, which counted the misses too; the score ignores them.
--
-- ─── The winning chain ────────────────────────────────────────────────────────
--
-- `path_player_ids` — A to B, stored with the winning move. Not ranked yet: it is there so that
-- counting the fame of the players on the chain can be tried on real days before it is decided.
-- Rows won before this migration have none.
--
-- ─── Order ────────────────────────────────────────────────────────────────────
--
-- Apply BEFORE deploying the build that reads it. `record_daily_move` keeps working for the
-- current build: `p_path` defaults to NULL.
--
-- Depends on 020_visitor_username.sql. Apply as ONE transaction in the Supabase SQL editor.
-- Rollback: 022_daily_score_rollback.sql.

BEGIN;

ALTER TABLE daily_results
  ADD COLUMN path_player_ids text[]
  CHECK (path_player_ids IS NULL OR (outcome = 'won' AND cardinality(path_player_ids) = links + 1));

-- The stats read one visitor's rows in one sport.
CREATE INDEX daily_results_visitor_idx ON daily_results (visitor_id, sport);

-- ─── One judged move — now with the winning chain ─────────────────────────────
--
-- As in 015, plus `p_path`: the winning chain, A to B, stored with `p_links`.
DROP FUNCTION public.record_daily_move(text, date, uuid, text, text, boolean, integer, integer);

CREATE FUNCTION public.record_daily_move(
  p_sport text,
  p_day date,
  p_visitor uuid,
  p_player_a text,
  p_player_b text,
  p_costs_life boolean,
  p_links integer,
  p_max_lives integer,
  p_path text[] DEFAULT NULL
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

  -- Right-hand sides read the row as it was before this update.
  UPDATE daily_results
     SET attempts        = attempts + 1,
         lives_lost      = lives_lost + p_costs_life::int,
         links           = p_links,
         path_player_ids = CASE WHEN p_links IS NOT NULL THEN p_path END,
         outcome         = CASE
                             WHEN p_links IS NOT NULL THEN 'won'
                             WHEN lives_lost + p_costs_life::int >= p_max_lives THEN 'lost'
                           END,
         finished_at     = CASE
                             WHEN p_links IS NOT NULL OR lives_lost + p_costs_life::int >= p_max_lives THEN now()
                           END
   WHERE sport = p_sport AND day = p_day AND visitor_id = p_visitor
     AND outcome IS NULL;
END;
$$;

-- ─── The ranking, by score ────────────────────────────────────────────────────
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

-- ─── A visitor's days ─────────────────────────────────────────────────────────
--
-- Every day the visitor has a row for in the sport, oldest first — unfinished ones included, with
-- a NULL outcome. The stats (streaks, distribution) are computed from these by the server
-- (`dailyStats`, src/domain/dailyScore.ts).
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

-- Supabase grants EXECUTE on new functions to anon and authenticated by default. Only the
-- server calls these.
REVOKE EXECUTE ON FUNCTION public.record_daily_move(text, date, uuid, text, text, boolean, integer, integer, text[])
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_stats(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_move(text, date, uuid, text, text, boolean, integer, integer, text[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_stats(text, uuid) TO service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- No won row has a negative score (a chain is never shorter than the optimum):
--   SELECT count(*) FROM daily_results r JOIN daily_challenges c USING (sport, day)
--    WHERE r.outcome = 'won' AND r.attempts - r.lives_lost < c.optimal_links - 1;   -- 0
--
-- The ranking of a played day — winners by score then time, losers last on one shared rank:
--   SELECT rank, username, outcome, score, added, needed, duration_ms
--     FROM daily_ranking('rugby', (now() AT TIME ZONE 'Europe/Paris')::date);
--
-- One visitor's days:
--   SELECT * FROM daily_stats('rugby', (SELECT visitor_id FROM daily_results LIMIT 1));
--
-- After the next win, its chain is stored, A first and B last:
--   SELECT day, links, path_player_ids FROM daily_results WHERE path_player_ids IS NOT NULL;
--
-- Closed to anon (both should fail with "permission denied"):
--   SET ROLE anon; SELECT * FROM daily_stats('rugby', gen_random_uuid()); RESET ROLE;
--   SET ROLE anon; SELECT * FROM daily_ranking('rugby', current_date); RESET ROLE;
