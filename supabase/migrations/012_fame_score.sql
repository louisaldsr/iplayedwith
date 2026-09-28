-- Computes `player_fame.score` — fame v1, a deliberately simple first draft.
--
-- 010 created the table and 011 put games onto `memberships`, but nothing derived the score:
-- every row sat at score NULL. This migration adds the formula and the step that runs it.
--
-- ─── The formula (revision 1) ─────────────────────────────────────────────────
--
--   score = round(100 × [ 0.55·s(caps, k_caps) + 0.45·s(games, k_games) ])
--   s(x, K) = min(1, √(x / K))
--
--   caps  = player_fame.details->>'caps'   — international caps; missing → 0
--   games = sum(memberships.games)         — career club games; NULL or no membership → 0
--
-- Two signals only, both cumulative: it measures LONGEVITY, not celebrity. A young star is
-- penalised for not having been around long enough (see docs/spikes/fame.md). Accepted for a
-- first draft — the point is to have a score to iterate on.
--
-- Caps weigh more because they mark being known BEYOND your own club. The weights are priors,
-- not a fit: there is no ground truth to fit them to. The games-per-season term from the spike
-- is left out of this revision.
--
-- √ gives diminishing returns: with k_games = 300, the first 40 games are worth 0.37 and the
-- next 160 another 0.45 — going from 0 to 40 turns an unknown into "seen them play".
--
-- ─── fame_calibration — the scale, as data ────────────────────────────────────
--
-- K is where a signal saturates: the count at which it contributes fully. It depends on how
-- much of a career each import sees (a whole career, or one set of leagues since some year),
-- so it differs per sport — but the formula does not. The constants therefore live in a table,
-- one row per sport, and nothing in the SQL branches on the sport. A new sport is an INSERT.
--
-- ─── Changing the formula or a constant ───────────────────────────────────────
--
-- Bump FAME_REVISION in compute_fame_scores() — for a formula change AND for a K change, since
-- both move scores — then:
--
--   SELECT compute_fame_scores('rugby');     -- or: npm run fame:compute -- --sport=rugby
--
-- Every row of the sport is rewritten, so there is no mixed state; `fame:report` flags any row
-- left on an older revision (a sport nobody recomputed).
--
-- Depends on 010_player_fame.sql and 011_membership_games.sql.
--
-- Apply as ONE transaction in the Supabase SQL editor. Rollback: 012_fame_score_rollback.sql.

BEGIN;

CREATE TABLE fame_calibration (
  -- No FK: there is no sports table. A row for a sport nobody plays is harmless; a MISSING row
  -- is what matters, and compute_fame_scores() refuses to run without one.
  sport    text    PRIMARY KEY,
  k_games  numeric NOT NULL,
  k_caps   numeric NOT NULL,

  CONSTRAINT fame_calibration_k_positive_check CHECK (k_games > 0 AND k_caps > 0)
);

-- Seeded from the observed ceilings in docs/spikes/fame.md. A first guess: read the report's
-- top 30, then tune here. Updating a K means bumping FAME_REVISION too — CREATE OR REPLACE the
-- function — otherwise the report cannot tell old scores from new.
--   rugby    — whole careers: most-capped ~115, busiest careers ~300 games
--   football — Big 5 since 2012: p99 ~440 games (max 665), p99 100 caps (max 233)
INSERT INTO fame_calibration (sport, k_games, k_caps) VALUES
  ('rugby',    300, 100),
  ('football', 600, 180);

ALTER TABLE fame_calibration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read fame_calibration" ON fame_calibration FOR SELECT USING (true);

GRANT SELECT ON fame_calibration TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON fame_calibration TO service_role;

-- Scores every player of one sport. Returns the number of rows scored.
--
-- Recomputes the whole sport every time: a few thousand rows, a handful of times a year. That
-- is what keeps it correct by construction — no incremental state to drift.
CREATE FUNCTION public.compute_fame_scores(p_sport text)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  -- Bump on ANY change to the formula below or to fame_calibration.
  FAME_REVISION CONSTANT smallint := 1;
  kg      numeric;
  kc      numeric;
  scored  integer;
BEGIN
  SELECT k_games, k_caps INTO kg, kc FROM fame_calibration WHERE sport = p_sport;
  -- Not a NULL fallback: `least(1, NULL)` is 1 in Postgres, so a missing constant would score
  -- every player 100 without a word. Measured once already (docs/spikes/fame.md).
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compute_fame_scores: no fame_calibration row for sport %', p_sport;
  END IF;

  -- Every player gets a score, including those no fame import reached (no cached profile, not
  -- in the dataset): their caps read as 0. fame:report still counts them as "no caps signal".
  INSERT INTO player_fame (sport, player_id)
  SELECT p.sport, p.id FROM players p WHERE p.sport = p_sport
      ON CONFLICT (sport, player_id) DO NOTHING;

  UPDATE player_fame f
     SET score = round(100 * (
                   0.55 * least(1, sqrt(s.caps  / kc))
                 + 0.45 * least(1, sqrt(s.games / kg))
                 ))::integer,
         revision       = FAME_REVISION,
         last_update_at = now()
    FROM (
      SELECT pf.player_id,
             -- The bag is open and written by scripts: read `caps` only when it is a number.
             CASE WHEN jsonb_typeof(pf.details -> 'caps') = 'number'
                  THEN greatest(0, (pf.details ->> 'caps')::numeric) ELSE 0 END AS caps,
             coalesce(g.games, 0)::numeric                                      AS games
        FROM player_fame pf
        LEFT JOIN (
          SELECT m.player_id, sum(m.games) AS games
            FROM memberships m
           WHERE m.sport = p_sport
           GROUP BY m.player_id
        ) g ON g.player_id = pf.player_id
       WHERE pf.sport = p_sport
    ) s
   WHERE f.sport = p_sport
     AND f.player_id = s.player_id;

  GET DIAGNOSTICS scored = ROW_COUNT;
  RETURN scored;
END;
$$;

-- Writes, so service_role only — same as apply_fame_details.
GRANT EXECUTE ON FUNCTION public.compute_fame_scores(text) TO service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- The guard must fire for an uncalibrated sport:
--   SELECT compute_fame_scores('cricket');   -- -> ERROR: no fame_calibration row
--
-- Score both sports, then:
--   SELECT compute_fame_scores('rugby');
--   SELECT compute_fame_scores('football');
--
--   -- Every player scored, all on one revision:
--   SELECT p.sport, count(*) AS players, count(f.score) AS scored,
--          array_agg(DISTINCT f.revision) AS revisions
--     FROM players p LEFT JOIN player_fame f ON f.player_id = p.id AND f.sport = p.sport
--    GROUP BY p.sport;
--
--   -- The top should be internationals you recognise:
--   SELECT p.name, f.score, f.details->>'caps' AS caps
--     FROM player_fame f JOIN players p ON p.id = f.player_id AND p.sport = f.sport
--    WHERE f.sport = 'rugby'
--    ORDER BY f.score DESC
--    LIMIT 10;
--
-- For the full picture (coverage, deciles, named top/bottom 30): npm run fame:report.
