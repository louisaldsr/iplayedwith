-- Daily results and the day's ranking — recorded by the server, never reported by the browser.
--
-- ─── What is stored ───────────────────────────────────────────────────────────
--
-- One row per (sport, day, visitor): how one browser played one day's challenge.
--
--   visitor_id  — the anonymous id the browser minted on its first visit (`ipw.playerId`,
--                 src/lib/visitor.ts). A browser, not a person: a private window or cleared site
--                 data gets a new id, hence a new row. Good enough until accounts.
--   started_at  — server time of "Start" (`start_daily_result`), or of the first move if Start
--                 never reached the server. Resuming the board later keeps it.
--   attempts    — every move the server JUDGED: accepted, or refused as linked to nobody. Not a
--                 transport error, not a malformed request — nothing that was not a real guess.
--   lives_lost  — the refused ones, i.e. the lives spent. The day is lost when it reaches the
--                 lives allowed (DAILY_LIVES, passed in by the server).
--   outcome     — 'won' | 'lost', NULL while the day is being played.
--   finished_at — server time of the move that ended it.
--   links       — length of the winning chain (A—X—B = 2). Won rows only.
--
-- Nothing here is written from the browser's word. The server counts the moves it judged and
-- stamps both times with its own clock; the client only says who it is. A finished row is
-- frozen: every update is `WHERE outcome IS NULL`, so replaying the day from the same browser
-- (after clearing its local progress) cannot improve a result.
--
-- ─── The ranking ──────────────────────────────────────────────────────────────
--
-- Deliberately simple, won rows only:
--   1. fewest attempts,
--   2. then shortest time (finished_at − started_at).
-- Ties share a rank (RANK()). Lives left and the fame of the players found will make a real
-- score later; lives_lost and links are stored now so that score can be computed on past days.
--
-- Server-side only for now: no endpoint serves it. Read it with `npm run daily:ranking`.
--
-- Depends on 013_daily_challenges.sql. Apply as ONE transaction in the Supabase SQL editor.
-- Rollback: 015_daily_results_rollback.sql.

BEGIN;

CREATE TABLE daily_results (
  sport        text        NOT NULL,
  day          date        NOT NULL,
  visitor_id   uuid        NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  attempts     integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lives_lost   integer     NOT NULL DEFAULT 0 CHECK (lives_lost >= 0 AND lives_lost <= attempts),
  outcome      text        CHECK (outcome IN ('won', 'lost')),
  finished_at  timestamptz,
  links        integer     CHECK (links >= 1),

  PRIMARY KEY (sport, day, visitor_id),
  FOREIGN KEY (sport, day) REFERENCES daily_challenges (sport, day) ON DELETE CASCADE,
  CHECK ((outcome IS NULL) = (finished_at IS NULL)),
  -- A chain length exactly on the won rows.
  CHECK ((outcome IS NOT DISTINCT FROM 'won') = (links IS NOT NULL))
);

-- The ranking reads one day's won rows.
CREATE INDEX daily_results_won_idx ON daily_results (sport, day) WHERE outcome = 'won';

-- Same as daily_challenges: RLS on, no policy, only the server (service_role) reads and writes.
ALTER TABLE daily_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON daily_results FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON daily_results TO service_role;

-- ─── Start ────────────────────────────────────────────────────────────────────
--
-- Opens the visitor's row for the day, stamping the start. Idempotent: a second Start (another
-- tab, a retry) keeps the first time. Does nothing for a day without a challenge.
CREATE OR REPLACE FUNCTION public.start_daily_result(p_sport text, p_day date, p_visitor uuid)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO daily_results (sport, day, visitor_id)
  SELECT c.sport, c.day, p_visitor
    FROM daily_challenges c
   WHERE c.sport = p_sport AND c.day = p_day
  ON CONFLICT DO NOTHING;
$$;

-- ─── One judged move ──────────────────────────────────────────────────────────
--
-- Counts one attempt for the visitor on the day's challenge, if — and only if — the move was
-- played on that day's pair: a board left open past midnight plays yesterday's pair and is
-- not recorded against today. Opens the row if Start never arrived.
--
--   p_costs_life — the move was refused as linked to nobody.
--   p_links      — set when the move won: the chain's length.
--   p_max_lives  — lives per day; spending the last one loses the day.
--
-- The UPDATE takes the row lock, so two moves at once are both counted, one after the other.
CREATE OR REPLACE FUNCTION public.record_daily_move(
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

  -- Right-hand sides read the row as it was before this update.
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

-- ─── The day's ranking ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.daily_ranking(p_sport text, p_day date)
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

-- Supabase grants EXECUTE on new functions to anon and authenticated by default. Only the
-- server calls these.
REVOKE EXECUTE ON FUNCTION public.start_daily_result(text, date, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_daily_move(text, date, uuid, text, text, boolean, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_daily_result(text, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_daily_move(text, date, uuid, text, text, boolean, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- A dry run on today's rugby pair, inside a transaction rolled back at the end — nothing stays:
--   BEGIN;
--   SELECT start_daily_result('rugby', (now() AT TIME ZONE 'Europe/Paris')::date,
--                             '00000000-0000-4000-8000-000000000001');
--   SELECT record_daily_move('rugby', d.day, '00000000-0000-4000-8000-000000000001',
--                            d.player_a_id, d.player_b_id, true, NULL, 3)      -- a wrong guess
--     FROM daily_challenges d WHERE sport = 'rugby' AND day = (now() AT TIME ZONE 'Europe/Paris')::date;
--   SELECT record_daily_move('rugby', d.day, '00000000-0000-4000-8000-000000000001',
--                            d.player_a_id, d.player_b_id, false, 2, 3)        -- the win
--     FROM daily_challenges d WHERE sport = 'rugby' AND day = (now() AT TIME ZONE 'Europe/Paris')::date;
--   SELECT * FROM daily_results;                           -- attempts 2, lives_lost 1, won, links 2
--   SELECT * FROM daily_ranking('rugby', (now() AT TIME ZONE 'Europe/Paris')::date);  -- rank 1
--   ROLLBACK;
--
-- A move on another pair is not recorded — must leave no row:
--   BEGIN;
--   SELECT record_daily_move('rugby', (now() AT TIME ZONE 'Europe/Paris')::date,
--                            '00000000-0000-4000-8000-000000000002', 'x', 'y', false, NULL, 3);
--   SELECT count(*) FROM daily_results;                    -- 0
--   ROLLBACK;
--
-- Not reachable with the public key — as anon, both must fail with "permission denied":
--   SET ROLE anon; SELECT * FROM daily_results; RESET ROLE;
--   SET ROLE anon; SELECT * FROM daily_ranking('rugby', '2000-01-01'); RESET ROLE;
