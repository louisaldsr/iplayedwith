-- Fame revision 2 — adds caps per season, the first signal that is not cumulative.
--
-- Revision 1 read two cumulative signals, caps and career games, so it measured LONGEVITY: on
-- the 2025-2026 Stade Toulousain squad a long-serving prop (Aldegheri, 28 caps in 13 seasons)
-- tied Romain Ntamack (46 caps in 9), and players with long club careers but few caps stayed
-- high on games alone (see docs/spikes/fame.md, "Revision 2").
--
-- ─── The formula (revision 2) ─────────────────────────────────────────────────
--
--   score = round(100 × [ 0.40·s(caps, k_caps) + 0.25·s(games, k_games) + 0.35·s(rate, k_rate) ])
--   rate  = caps / greatest(seasons, 3)
--   s(x, K) = min(1, √(x / K))
--
--   seasons = distinct seasons across the player's memberships
--
-- `rate` separates a first-choice international from a player who was capped now and then over
-- a long career. It has a second virtue: caps and seasons are both cut by the start of the data
-- (2012-2013), so their ratio survives that cut where the totals do not — a player whose career
-- straddles it keeps a fair rate on the seasons we do see (Dusautoir: 18 caps over 4 seasons).
--
-- The floor of 3 seasons stops one season from producing an extreme rate: 5 caps in a single
-- season reads as 5/3, not 5.
--
-- Games lose weight (0.45 → 0.25): they are the purest longevity signal. Caps stay the largest
-- single term. Weights are still priors, not a fit.
--
-- Pairs with the rugby parser fix of the same change: caps are now SENIOR caps only (U20, A,
-- XV, Barbarians … used to count). Re-run the rugby fame import after applying this.
--
-- ─── k_rate ───────────────────────────────────────────────────────────────────
--
-- The caps-per-season rate at which the term saturates: a nailed-on international. Per sport,
-- in fame_calibration like the other K — rugby 6 (about a Six Nations plus a Test window a
-- season), football 8 (a qualifying campaign plus friendlies).
--
-- Depends on 012_fame_score.sql. Apply as ONE transaction. Rollback: 014_fame_rate_rollback.sql.
--
-- Then: npm run seed:fame   (rugby: re-parses senior caps, then recomputes)
--       npm run fame:compute -- --sport=football

BEGIN;

ALTER TABLE fame_calibration ADD COLUMN k_rate numeric;
UPDATE fame_calibration SET k_rate = 6 WHERE sport = 'rugby';
UPDATE fame_calibration SET k_rate = 8 WHERE sport = 'football';
-- A sport calibrated in 012 but not listed above would be left NULL: fail here, not at compute.
ALTER TABLE fame_calibration ALTER COLUMN k_rate SET NOT NULL;
ALTER TABLE fame_calibration ADD CONSTRAINT fame_calibration_k_rate_positive_check CHECK (k_rate > 0);

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

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
--   SELECT * FROM fame_calibration;             -- k_rate: rugby 6, football 8
--
-- After the re-import / recompute, every row is on revision 2:
--   SELECT sport, array_agg(DISTINCT revision) FROM player_fame GROUP BY sport;
--
-- Then npm run fame:report -- --sport=rugby (and football): read the named top/bottom 30 and the
-- Floors section — revision 2 grows the `famous` floor, so the 70 / 30 thresholds need a look.
