-- Fame revision 3 — adds `stage`: the prestige of the squads the player played in.
--
-- Revisions 1 and 2 read caps, games and caps per season: they measure a career, not where it
-- was played. A long-serving player at a small club ranked like one at a giant. `stage` reads
-- the season prestige of 023 through the player's own memberships.
--
-- ─── The formula (revision 3) ─────────────────────────────────────────────────
--
--   score = round(100 × [ 0.30·s(caps, k_caps) + 0.20·s(games, k_games)
--                       + 0.25·s(rate, k_rate) + 0.25·min(1, stage / k_stage) ])
--   stage = Σ over memberships ( prestige(club, season) / 100 × w ) / Σ w      — 0..1
--   w     = memberships.games
--   rate  = caps / greatest(seasons, 3)        s(x, K) = min(1, √(x / K))
--
-- `stage` is a CAREER AVERAGE, weighted by games: each season counts as much as the player
-- played it. A back-up with three games at Real Madrid barely moves; a starter through
-- Toulouse's title season takes it fully. A player whose memberships carry no game count at
-- all (every `games` NULL or 0) weighs each membership equally instead, rather than scoring 0.
--
-- The accepted cost of an average: a career that ends in a smaller league pulls it down.
-- `fame:report` shows `stage` on every line, so those players can be judged by name.
--
-- It is ADDED, not multiplied: a multiplier would crush capped internationals playing at
-- modest clubs (Georgia, Tonga, the Drua).
--
-- ─── k_stage ──────────────────────────────────────────────────────────────────
--
-- An average of club-seasons never reaches 1: even Modrić, twelve seasons at Real, reads 0.71.
-- Read raw, the term topped out near 0.18 for the best-placed players while taking 0.25 of
-- weight from terms they had already saturated — measured on local copies of both sports, the
-- `famous` floor fell from 297 to 121 players (rugby) and 426 to 117 (football).
--
-- So `stage` saturates at k_stage like every other signal, at the observed ceiling (p99:
-- rugby 0.64, football 0.69 → 0.65 and 0.70). LINEAR below it, not √: prestige already carries
-- the diminishing returns, and a second √ lifted mid-table careers too far (Parejo 38 → 44,
-- rugby `known` floor 1,279 → 1,927). With it, `famous` holds 210 rugby / 193 football players,
-- and on the names: Dupont 86 → 84 passes Kinghorn 89 → 83; Yamal 64 → 71, Vinícius 75 → 81;
-- Griezmann 95 → 87, Fickou 97 → 87 (Stade Français, Racing); Parejo stays 38.
--
-- The other weights shrink by about a quarter each (0.40/0.25/0.35 → 0.30/0.20/0.25), caps
-- stay the largest single term. Still priors, not a fit.
--
-- ─── Order ────────────────────────────────────────────────────────────────────
--
-- compute_fame_scores now calls compute_season_prestige first: fame can never read a
-- prestige older than its inputs, and `fame:compute` stays the one command after any change.
--
-- Depends on 023_season_prestige.sql. Apply as ONE transaction.
-- Rollback: 025_fame_stage_rollback.sql (back to revision 2).
--
-- Then: npm run seed:prestige (rugby, from the checkout with the profile cache) and
--       npm run seed:football:prestige — each writes its signals and recomputes the sport.

BEGIN;

ALTER TABLE fame_calibration ADD COLUMN k_stage numeric;
UPDATE fame_calibration SET k_stage = 0.65 WHERE sport = 'rugby';
UPDATE fame_calibration SET k_stage = 0.70 WHERE sport = 'football';
-- A sport calibrated earlier but not listed above would be left NULL: fail here, not at compute.
ALTER TABLE fame_calibration ALTER COLUMN k_stage SET NOT NULL;
ALTER TABLE fame_calibration
  ADD CONSTRAINT fame_calibration_k_stage_range_check CHECK (k_stage > 0 AND k_stage <= 1);

CREATE OR REPLACE FUNCTION public.compute_fame_scores(p_sport text)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  -- Bump on ANY change to the formula below or to fame_calibration.
  FAME_REVISION CONSTANT smallint := 3;
  -- Denominator floor for the rate: see 014_fame_rate.sql.
  MIN_RATE_SEASONS CONSTANT numeric := 3;
  kg      numeric;
  kc      numeric;
  kr      numeric;
  ks      numeric;
  scored  integer;
BEGIN
  SELECT k_games, k_caps, k_rate, k_stage INTO kg, kc, kr, ks FROM fame_calibration WHERE sport = p_sport;
  -- Not a NULL fallback: `least(1, NULL)` is 1 in Postgres, so a missing constant would score
  -- every player 100 without a word. The columns are NOT NULL, so only a missing row is left.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compute_fame_scores: no fame_calibration row for sport %', p_sport;
  END IF;

  PERFORM public.compute_season_prestige(p_sport);

  INSERT INTO player_fame (sport, player_id)
  SELECT p.sport, p.id FROM players p WHERE p.sport = p_sport
      ON CONFLICT (sport, player_id) DO NOTHING;

  UPDATE player_fame f
     SET score = round(100 * (
                   0.30 * least(1, sqrt(s.caps  / kc))
                 + 0.20 * least(1, sqrt(s.games / kg))
                 + 0.25 * least(1, sqrt(s.caps / greatest(s.seasons, MIN_RATE_SEASONS) / kr))
                 + 0.25 * least(1, s.stage / ks)
                 ))::integer,
         revision       = FAME_REVISION,
         last_update_at = now()
    FROM (
      SELECT pf.player_id,
             CASE WHEN jsonb_typeof(pf.details -> 'caps') = 'number'
                  THEN greatest(0, (pf.details ->> 'caps')::numeric) ELSE 0 END AS caps,
             coalesce(g.games, 0)::numeric                                      AS games,
             coalesce(g.seasons, 0)::numeric                                    AS seasons,
             coalesce(g.stage, 0)::numeric                                      AS stage
        FROM player_fame pf
        LEFT JOIN (
          SELECT m.player_id,
                 sum(m.games)              AS games,
                 count(DISTINCT m.season)  AS seasons,
                 -- A membership whose club-season has no score yet (none should, the call above
                 -- scored every one) counts as 0 rather than dropping out of the average.
                 CASE WHEN sum(coalesce(m.games, 0)) > 0
                      THEN sum(coalesce(csp.score, 0) * coalesce(m.games, 0)) / sum(coalesce(m.games, 0))
                      ELSE avg(coalesce(csp.score, 0))
                 END / 100.0               AS stage
            FROM memberships m
            LEFT JOIN club_season_prestige csp
              ON csp.sport = m.sport AND csp.club_id = m.club_id AND csp.season = m.season
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
--   SELECT * FROM fame_calibration;             -- k_stage: rugby 0.65, football 0.70
--
-- After both prestige imports, every row is on revision 3:
--   SELECT sport, array_agg(DISTINCT revision) FROM player_fame GROUP BY sport;
--
-- Then npm run fame:report -- --sport=rugby (and football): the named top/bottom 30, the stage
-- column, and the Floors section — the 70 / 30 thresholds get their one review here.
