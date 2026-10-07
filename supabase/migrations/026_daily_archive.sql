-- Past daily challenges, played late — the archive.
--
-- Every day since a sport's launch stays playable. A day played after its own date counts like any
-- other in the visitor's stats (played, won, scores) and in that day's ranking — but LATE:
--
--   late = the visitor started the day after it was over: the Paris date of `started_at` is past
--          `day`. Derived, never stored — `started_at` is already the server's own clock.
--
-- A day started on time and finished late (a board left open past midnight, picked up the next
-- morning) is NOT late: it was started on its day, its time runs from there.
--
-- ─── The ranking ──────────────────────────────────────────────────────────────
--
-- Winners on time, by score then time; then late winners, by score then time — after every
-- on-time winner, whatever their score: they played knowing the day was over (and could have read
-- the pair's chain elsewhere). Then everyone who lost, on one shared rank, as in 022. `late` is
-- returned for every row.
--
-- ─── The stats ────────────────────────────────────────────────────────────────
--
-- `daily_stats` returns `late` too: late days count in played / won / the score distribution, never
-- in the streaks (src/domain/dailyScore.ts) — a missed day must not be filled in afterwards. And
-- `lives_lost`: the archive lists each day with the visitor's result, a finished one with its lives.
--
-- ─── The recording functions ──────────────────────────────────────────────────
--
-- Unchanged: `start_daily_result`, `record_daily_move` and `record_daily_hint` already take the
-- day and check the pair against it. "Today only" lived in the API, which now accepts any day up
-- to today (never a future one: tomorrow's pair is already drawn and must stay hidden).
--
-- ⚠️ `Europe/Paris` is now written a third time: `CHALLENGE_TIME_ZONE` (API), the pg_cron job
-- (013), and `challenge_day_of` below. Change all three together.
--
-- Depends on 022_daily_score.sql. Apply BEFORE deploying the build that reads `late`: the current
-- build ignores the extra column. Apply as ONE transaction in the Supabase SQL editor.
-- Rollback: 026_daily_archive_rollback.sql.

BEGIN;

-- The challenge day a moment falls in — the SQL twin of `challengeDayOf` (src/domain/dailyChallenge.ts).
CREATE FUNCTION public.challenge_day_of(p_at timestamptz)
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (p_at AT TIME ZONE 'Europe/Paris')::date;
$$;

-- ─── The ranking, late results after on-time ones ─────────────────────────────
DROP FUNCTION public.daily_ranking(text, date);

CREATE FUNCTION public.daily_ranking(p_sport text, p_day date)
RETURNS TABLE (
  rank            bigint,
  visitor_id      uuid,
  username        text,
  outcome         text,
  late            boolean,
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
           challenge_day_of(r.started_at) > r.day AS late,
           r.attempts - r.lives_lost              AS added,
           c.optimal_links - 1                    AS needed
      FROM daily_results r
      JOIN daily_challenges c USING (sport, day)
     WHERE r.sport = p_sport AND r.day = p_day AND r.outcome IS NOT NULL
  )
  SELECT CASE
           WHEN f.outcome = 'won'
             THEN rank() OVER (ORDER BY f.outcome = 'lost', f.late, f.added - f.needed, f.finished_at - f.started_at)
           ELSE count(*) FILTER (WHERE f.outcome = 'won') OVER () + 1
         END,
         f.visitor_id,
         v.username,
         f.outcome,
         f.late,
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
   ORDER BY 1, f.late, f.finished_at;
$$;

-- ─── A visitor's days, late ones marked ───────────────────────────────────────
DROP FUNCTION public.daily_stats(text, uuid);

CREATE FUNCTION public.daily_stats(p_sport text, p_visitor uuid)
RETURNS TABLE (
  day         date,
  outcome     text,
  late        boolean,
  lives_lost  integer,
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
         challenge_day_of(r.started_at) > r.day,
         r.lives_lost,
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
REVOKE EXECUTE ON FUNCTION public.challenge_day_of(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_stats(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.challenge_day_of(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_stats(text, uuid) TO service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- The Paris day, not the UTC one — 23:30 UTC in summer is already the next day in Paris:
--   SELECT challenge_day_of('2026-07-15 23:30:00+00');                               -- 2026-07-16
--
-- No result is late yet (the build that accepts past days is not deployed): both return 0.
--   SELECT count(*) FROM daily_results WHERE challenge_day_of(started_at) > day;
--   SELECT count(*) FROM daily_ranking('rugby', (now() AT TIME ZONE 'Europe/Paris')::date) WHERE late;
--
-- One visitor's days, with the new column:
--   SELECT * FROM daily_stats('rugby', (SELECT visitor_id FROM daily_results LIMIT 1));
--
-- Closed to anon (should fail with "permission denied"):
--   SET ROLE anon; SELECT * FROM daily_ranking('rugby', current_date); RESET ROLE;
