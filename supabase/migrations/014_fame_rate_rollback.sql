-- Undoes 014_fame_rate.sql, back to the 012 state (fame revision 1).
--
-- Not destructive: scores are derived. After this, recompute both sports to bring every row back
-- to revision 1:
--   SELECT compute_fame_scores('rugby');  SELECT compute_fame_scores('football');
--
-- The rugby caps stay senior-only (that fix is in the import, not here): recomputing with the
-- revision 1 formula on senior caps is still more correct than the original revision 1 scores.

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_fame_scores(p_sport text)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  FAME_REVISION CONSTANT smallint := 1;
  kg      numeric;
  kc      numeric;
  scored  integer;
BEGIN
  SELECT k_games, k_caps INTO kg, kc FROM fame_calibration WHERE sport = p_sport;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compute_fame_scores: no fame_calibration row for sport %', p_sport;
  END IF;

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

ALTER TABLE fame_calibration DROP CONSTRAINT IF EXISTS fame_calibration_k_rate_positive_check;
ALTER TABLE fame_calibration DROP COLUMN IF EXISTS k_rate;

COMMIT;
