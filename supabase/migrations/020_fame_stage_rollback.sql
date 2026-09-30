-- Undoes 020_fame_stage.sql, back to fame revision 2 (014_fame_rate.sql).
--
-- Not destructive: scores are derived, and the season prestige of 018 stays in place. After
-- this, recompute both sports to bring every row back to revision 2:
--   SELECT compute_fame_scores('rugby');  SELECT compute_fame_scores('football');
--
-- Roll this back BEFORE 018: the revision 3 function reads what 018 creates.

BEGIN;

ALTER TABLE fame_calibration DROP CONSTRAINT IF EXISTS fame_calibration_k_stage_range_check;
ALTER TABLE fame_calibration DROP COLUMN IF EXISTS k_stage;

CREATE OR REPLACE FUNCTION public.compute_fame_scores(p_sport text)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  -- Bump on ANY change to the formula below or to fame_calibration.
  FAME_REVISION CONSTANT smallint := 2;
  -- Denominator floor for the rate: see the header.
  MIN_RATE_SEASONS CONSTANT numeric := 3;
  kg      numeric;
  kc      numeric;
  kr      numeric;
  scored  integer;
BEGIN
  SELECT k_games, k_caps, k_rate INTO kg, kc, kr FROM fame_calibration WHERE sport = p_sport;
  -- Not a NULL fallback: `least(1, NULL)` is 1 in Postgres, so a missing constant would score
  -- every player 100 without a word. The columns are NOT NULL, so only a missing row is left.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compute_fame_scores: no fame_calibration row for sport %', p_sport;
  END IF;

  INSERT INTO player_fame (sport, player_id)
  SELECT p.sport, p.id FROM players p WHERE p.sport = p_sport
      ON CONFLICT (sport, player_id) DO NOTHING;

  UPDATE player_fame f
     SET score = round(100 * (
                   0.40 * least(1, sqrt(s.caps  / kc))
                 + 0.25 * least(1, sqrt(s.games / kg))
                 + 0.35 * least(1, sqrt(s.caps / greatest(s.seasons, MIN_RATE_SEASONS) / kr))
                 ))::integer,
         revision       = FAME_REVISION,
         last_update_at = now()
    FROM (
      SELECT pf.player_id,
             CASE WHEN jsonb_typeof(pf.details -> 'caps') = 'number'
                  THEN greatest(0, (pf.details ->> 'caps')::numeric) ELSE 0 END AS caps,
             coalesce(g.games, 0)::numeric                                      AS games,
             coalesce(g.seasons, 0)::numeric                                    AS seasons
        FROM player_fame pf
        LEFT JOIN (
          SELECT m.player_id, sum(m.games) AS games, count(DISTINCT m.season) AS seasons
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

COMMIT;
