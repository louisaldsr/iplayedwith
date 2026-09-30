-- Hints in the daily challenge: the careers opened during the game.
--
-- Any player card on the board opens that player's career (clubs and seasons). It helps, but it
-- does not solve: it says where to look, not who played there. It is free — the same career is a
-- search away on Wikipedia, and charging for it in the game would only tax the honest players —
-- but it is RECORDED, so a future score can reward a chain found from memory ("no hints" badge,
-- or a bonus) rather than punish the help.
--
--   hint_player_ids — the distinct players whose career was opened while the day was being
--                     played. Opening the same career twice counts once.
--
-- Not hints: A's and B's careers (the intro shows them; everyone needs them to start), careers
-- opened after the day is over (the row is frozen), and anything in free play.
--
-- Recorded on the client's word: the career endpoint is public, so a career read directly is not
-- counted. Good enough — the alternative, a search engine, is not counted either.
--
-- The ranking (v1: attempts, then time) does not use it yet; `daily_ranking` returns the count.
--
-- Depends on 015_daily_results.sql. Apply as ONE transaction in the Supabase SQL editor.
-- Rollback: 016_daily_hints_rollback.sql.

BEGIN;

ALTER TABLE daily_results ADD COLUMN hint_player_ids text[] NOT NULL DEFAULT '{}';

-- ─── One career opened ────────────────────────────────────────────────────────
--
-- Ignored when the day has no challenge, when the player is A or B, when the player does not
-- exist in the sport, or when the visitor's day is over. Opens the row if Start never arrived.
CREATE OR REPLACE FUNCTION public.record_daily_hint(p_sport text, p_day date, p_visitor uuid, p_player text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM daily_challenges
     WHERE sport = p_sport AND day = p_day AND p_player NOT IN (player_a_id, player_b_id)
  ) OR NOT EXISTS (
    SELECT 1 FROM players WHERE sport = p_sport AND id = p_player
  ) THEN
    RETURN;
  END IF;

  INSERT INTO daily_results (sport, day, visitor_id)
  VALUES (p_sport, p_day, p_visitor)
  ON CONFLICT DO NOTHING;

  UPDATE daily_results
     SET hint_player_ids = array_append(hint_player_ids, p_player)
   WHERE sport = p_sport AND day = p_day AND visitor_id = p_visitor
     AND outcome IS NULL
     AND NOT (p_player = ANY (hint_player_ids));
END;
$$;

-- ─── The ranking, now with the hint count ─────────────────────────────────────
--
-- Same order as 015 — hints are shown, not ranked. The return type changes, hence DROP + CREATE.
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

REVOKE EXECUTE ON FUNCTION public.record_daily_hint(text, date, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_hint(text, date, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- A dry run on today's rugby pair, rolled back — nothing stays. <id X> is any other rugby player:
--   BEGIN;
--   SELECT record_daily_hint('rugby', d.day, '00000000-0000-4000-8000-000000000001', '<id X>')
--     FROM daily_challenges d WHERE sport = 'rugby' AND day = (now() AT TIME ZONE 'Europe/Paris')::date;
--   SELECT record_daily_hint('rugby', d.day, '00000000-0000-4000-8000-000000000001', '<id X>')
--     FROM daily_challenges d WHERE sport = 'rugby' AND day = (now() AT TIME ZONE 'Europe/Paris')::date;
--   SELECT record_daily_hint('rugby', d.day, '00000000-0000-4000-8000-000000000001', d.player_a_id)
--     FROM daily_challenges d WHERE sport = 'rugby' AND day = (now() AT TIME ZONE 'Europe/Paris')::date;
--   SELECT hint_player_ids FROM daily_results;            -- {<id X>}: once, and not A
--   ROLLBACK;
--
-- Closed to the public key — as anon, must fail with "permission denied":
--   SET ROLE anon; SELECT record_daily_hint('rugby', '2000-01-01', gen_random_uuid(), 'x'); RESET ROLE;
