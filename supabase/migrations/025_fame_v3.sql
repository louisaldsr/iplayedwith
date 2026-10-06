-- Fame revision 3 — four pillars: longevity, club performance, international performance, exposure.
--
-- Revision 2 read caps, games and caps per season. Caps carried more than half the score, so
-- "performance" meant "picked by your country" — a Top 14 star with few England caps (Jack Willis)
-- stayed `known`, and 22 caps for Spain counted like 22 for New Zealand. Nothing measured how much
-- the public actually hears of a player. Designed and checked on a prototype over both full
-- rosters (docs/spikes/fame.md, "Revision 3").
--
-- ─── The formula (revision 3) ─────────────────────────────────────────────────
--
--   score = round(100 × [ 0.15·L + 0.20·P_club + 0.20·P_intl + 0.45·E ])
--   no Wikipedia match (E unknown) → round(100 × [ 0.15·L + 0.20·P_club + 0.20·P_intl ] / 0.55)
--
--   L      = min(1, career games / k_games)                                   longevity, linear
--   P_club = min(1, club_rate / k_club)                                       club performance
--            club_rate = Σ of the 5 best (role × prestige/100) / clamp(seasons, 3, 5)
--            role      = the player's share of his squad's STARTS that club-season (the most
--                        any squad member started = 1), or of its MINUTES when the source has
--                        no starts; prestige = club_season_prestige (023)
--   P_intl = min(1, √(caps_rate / k_rate))                                   international
--            caps_rate = Σ caps × nation tier / max(seasons, 3)
--   E      = clamp((log10(views per year) − 2) / (log10(v_max) − 2), 0, 1)   exposure
--            views per year = French + English Wikipedia views, 3-year mean
--
-- Measured choices (the prototype, both sports):
--
-- - PER SEASON, not cumulative: longevity is the only career total. Cumulative performance terms
--   held young stars down — Lamine Yamal 68 with 10.5M views a year; per season, 85.
-- - STARTS, not minutes, where the source has them: props, hookers and scrum-halves are replaced
--   around the hour, so minutes made first-choice front-rowers look like part-timers.
-- - NATION TIERS: caps × the weight of the nation (nation_tiers). Inside one Pro D2 squad, raw
--   caps correlated NEGATIVELY with how much people read about a player (−0.36): Spain caps.
-- - VIEWS on a log scale: they range from 100 to 17 million a year. Three years, not the last
--   60 days, which a single news story could swing (Ma'a Nonu read like a star).
-- - CEILINGS per sport, in data (fame_calibration): the per-season measures saturate at the
--   sport's p99; views at the level of its single biggest star. Only a handful of complete
--   stars reach 90+.
-- - The fallback is not a zero: a player with no Wikipedia match is scored on what is known.
--   Coverage is 93-95% of rugby players past 100 games, 98% of football.
--
-- Weights are priors, agreed on the named results of both sports, not a fit.
--
-- ─── What changes in the schema ───────────────────────────────────────────────
--
--   memberships.starts / .minutes     — per club-season, like `games` (011): NULL = unknown
--   nation_tiers                      — the weight of a cap, per nation, in data
--   fame_calibration                  — k_games/k_rate new values; k_club, v_max added
--   player_fame.terms                 — the four pillars behind each score, for the report
--   compute_fame_scores               — revision 3
--
-- The inputs arrive through the imports: `seed:fame` (caps per nation, starts/minutes, football
-- tiers) and `fame:exposure` (Wikidata match + views). Until they run, a sport scores with every
-- missing input read as 0 or unknown — never 100 (the `least(1, NULL)` trap is guarded).
--
-- Depends on 023_season_prestige.sql and 024_seed_rugby_titles.sql. Apply as ONE transaction.
-- Rollback: 025_fame_v3_rollback.sql (back to revision 2).

BEGIN;

-- ─── The rugby titles no squad can carry ──────────────────────────────────────

-- 024 seeded the rugby titles from 2012-13, but the rugby graph effectively starts in 2013-14:
-- production holds 69 memberships for 2012-13 (stray squads) against ~1,800 a season after. Five
-- of the 2012-13 titles land on a club-season with no membership at all (Castres' Top 14,
-- Leicester's Premiership, Leinster's league and Challenge Cup, the Chiefs' Super Rugby): a
-- title no player of the graph can carry. The score already ignores them; they are removed so
-- 024's own check reads 0. The 2012-13 titles that do have a squad stay (Toulon's European Cup).
--
-- Re-applying 024 (it replaces its own rows) brings them back: re-run this DELETE after it.
DELETE FROM club_titles t
 WHERE t.sport = 'rugby'
   AND t.source = 'seed:024'
   AND t.season = '2012-2013'
   AND NOT EXISTS (SELECT 1 FROM memberships m
                    WHERE m.sport = t.sport AND m.club_id = t.club_id AND m.season = t.season);

-- ─── Starts and minutes, per membership ───────────────────────────────────────

ALTER TABLE memberships ADD COLUMN starts integer;
ALTER TABLE memberships ADD COLUMN minutes integer;
ALTER TABLE memberships
  ADD CONSTRAINT memberships_starts_check  CHECK (starts IS NULL OR starts >= 0),
  ADD CONSTRAINT memberships_minutes_check CHECK (minutes IS NULL OR minutes >= 0);

-- Written by the fame imports in bulk, UPDATE only: a membership is created by the membership
-- import, never here. A row for a membership that does not exist is skipped, and shows up as a
-- gap between rows sent and rows written.
--
-- `p_rows`: [{"player_id": "...", "club_id": "...", "season": "2023-2024", "starts": 18, "minutes": 1430}, ...]
-- A key left out is left untouched; a key sent as null writes NULL ("the source does not say").
CREATE FUNCTION public.apply_membership_stats(p_sport text, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  written integer;
BEGIN
  UPDATE memberships m
     SET starts  = CASE WHEN r.elem ? 'starts'  THEN (r.elem ->> 'starts')::integer  ELSE m.starts  END,
         minutes = CASE WHEN r.elem ? 'minutes' THEN (r.elem ->> 'minutes')::integer ELSE m.minutes END
    FROM jsonb_array_elements(p_rows) AS r(elem)
   WHERE m.sport = p_sport
     AND m.player_id = r.elem ->> 'player_id'
     AND m.club_id = r.elem ->> 'club_id'
     AND m.season = r.elem ->> 'season';

  GET DIAGNOSTICS written = ROW_COUNT;
  RETURN written;
END;
$$;

-- ─── Nation tiers ─────────────────────────────────────────────────────────────

-- The weight of one cap for each national team, as the import labels it in
-- `player_fame.details.capsByNation`. A nation missing here weighs 0.1: a cap for an unknown or
-- minor nation still says something, not much.
--
-- `source` says who wrote the row: rugby tiers are curated below, football tiers are written by
-- the import from the dataset's FIFA ranking (and replaced on each import).
CREATE TABLE nation_tiers (
  sport   text    NOT NULL,
  nation  text    NOT NULL,
  weight  numeric NOT NULL,
  source  text    NOT NULL,

  PRIMARY KEY (sport, nation),

  CONSTRAINT nation_tiers_sport_check  CHECK (sport IN ('rugby', 'football')),
  CONSTRAINT nation_tiers_weight_check CHECK (weight > 0 AND weight <= 1)
);

-- Rugby: World Rugby's top tier and the Lions 1, the next five unions 0.5, the next nine 0.2.
-- Labels as allrugby.com writes them (French) and as all.rugby does (English).
INSERT INTO nation_tiers (sport, nation, weight, source)
SELECT 'rugby', v.nation, v.weight, 'seed:025'
FROM (VALUES
  ('France', 1.0), ('Angleterre', 1.0), ('England', 1.0), ('Irlande', 1.0), ('Ireland', 1.0),
  ('Écosse', 1.0), ('Scotland', 1.0), ('Galles', 1.0), ('Wales', 1.0), ('Italie', 1.0), ('Italy', 1.0),
  ('Nouvelle-Zélande', 1.0), ('New Zealand', 1.0), ('Australie', 1.0), ('Australia', 1.0),
  ('Afrique du Sud', 1.0), ('South Africa', 1.0), ('Argentine', 1.0), ('Argentina', 1.0),
  ('Lions', 1.0), ('British & Irish Lions', 1.0),
  ('Fidji', 0.5), ('Fiji', 0.5), ('Samoa', 0.5), ('Tonga', 0.5), ('Géorgie', 0.5), ('Georgia', 0.5),
  ('Japon', 0.5), ('Japan', 0.5),
  ('Espagne', 0.2), ('Spain', 0.2), ('USA', 0.2), ('Portugal', 0.2), ('Roumanie', 0.2), ('Romania', 0.2),
  ('Namibie', 0.2), ('Namibia', 0.2), ('Canada', 0.2), ('Uruguay', 0.2), ('Chili', 0.2), ('Chile', 0.2),
  ('Russie', 0.2), ('Russia', 0.2)
) AS v(nation, weight);

-- Replaces every tier one writer owns for a sport, in one call (the football import, from the
-- FIFA ranking). Rows of another source are never touched.
--
-- `p_rows`: [{"nation": "Spain", "weight": 1}, ...]
CREATE FUNCTION public.replace_nation_tiers(p_sport text, p_source text, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  written integer;
BEGIN
  DELETE FROM nation_tiers WHERE sport = p_sport AND source = p_source;
  INSERT INTO nation_tiers (sport, nation, weight, source)
  SELECT p_sport, r.nation, r.weight, p_source
    FROM jsonb_to_recordset(p_rows) AS r(nation text, weight numeric)
      ON CONFLICT (sport, nation) DO NOTHING;
  GET DIAGNOSTICS written = ROW_COUNT;
  RETURN written;
END;
$$;

-- ─── Calibration ──────────────────────────────────────────────────────────────

-- k_games  career games at which longevity saturates — a long top-level career
--          (rugby 260 ≈ p99; football 550: at its p99, 440, the 14-season veterans all tied)
-- k_rate   now WEIGHTED caps per season at which P_intl saturates (p99: rugby 7.5, football 9)
-- k_club   club_rate at which P_club saturates (p99: rugby 0.45, football 0.47)
-- v_max    views per year at which E saturates — the sport's biggest star
--          (rugby 1,000,000 ≈ Dupont; football 15,000,000 ≈ Ronaldo)
-- k_caps is no longer read: revision 3 has no cumulative caps term. Kept for the rollback.
ALTER TABLE fame_calibration ADD COLUMN k_club numeric;
ALTER TABLE fame_calibration ADD COLUMN v_max numeric;
UPDATE fame_calibration SET k_games = 260, k_rate = 7.5, k_club = 0.45, v_max = 1000000  WHERE sport = 'rugby';
UPDATE fame_calibration SET k_games = 550, k_rate = 9.0, k_club = 0.47, v_max = 15000000 WHERE sport = 'football';
-- A sport calibrated earlier but not listed above would be left NULL: fail here, not at compute.
ALTER TABLE fame_calibration ALTER COLUMN k_club SET NOT NULL;
ALTER TABLE fame_calibration ALTER COLUMN v_max SET NOT NULL;
ALTER TABLE fame_calibration
  ADD CONSTRAINT fame_calibration_k_club_positive_check CHECK (k_club > 0),
  ADD CONSTRAINT fame_calibration_v_max_check CHECK (v_max > 100);

-- ─── The pillars behind each score ────────────────────────────────────────────

-- {"longevity": 0.84, "club": 1, "intl": 0.89, "exposure": 1} — each 0..1, `exposure` null when
-- the player has no Wikipedia match. An OUTPUT, written with `score`, never by an import: it is
-- what `fame:report` prints, so a score can be explained without recomputing it.
ALTER TABLE player_fame ADD COLUMN terms jsonb;

-- ─── The score ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_fame_scores(p_sport text)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  -- Bump on ANY change to the formula below, to nation_tiers' default or to fame_calibration.
  FAME_REVISION CONSTANT smallint := 3;
  -- Seasons below which a per-season measure is not divided further: one great season is not a
  -- career (the floor of 014's caps rate).
  MIN_SEASONS CONSTANT numeric := 3;
  -- The best seasons the club measure averages.
  BEST_SEASONS CONSTANT integer := 5;
  -- The weight of a cap for a nation nation_tiers does not list.
  DEFAULT_TIER CONSTANT numeric := 0.1;
  cal     fame_calibration%ROWTYPE;
  scored  integer;
BEGIN
  SELECT * INTO cal FROM fame_calibration WHERE sport = p_sport;
  -- Not a NULL fallback: `least(1, NULL)` is 1 in Postgres, so a missing constant would score
  -- every player 100 without a word. The columns are NOT NULL, so only a missing row is left.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compute_fame_scores: no fame_calibration row for sport %', p_sport;
  END IF;

  -- The squads' prestige first: fame never reads a prestige older than its inputs.
  PERFORM public.compute_season_prestige(p_sport);

  INSERT INTO player_fame (sport, player_id)
  SELECT p.sport, p.id FROM players p WHERE p.sport = p_sport
      ON CONFLICT (sport, player_id) DO NOTHING;

  WITH career AS (
    SELECT m.player_id, sum(coalesce(m.games, 0)) AS games, count(DISTINCT m.season) AS seasons
      FROM memberships m WHERE m.sport = p_sport GROUP BY m.player_id
  ),
  -- The player's share of his squad that season: starts when the source gives them for that
  -- squad, minutes otherwise. The most any squad member started (or played) is 1.
  squad AS (
    SELECT m.player_id, m.club_id, m.season, m.starts, m.minutes,
           max(m.starts)  OVER (PARTITION BY m.club_id, m.season) AS max_starts,
           max(m.minutes) OVER (PARTITION BY m.club_id, m.season) AS max_minutes
      FROM memberships m WHERE m.sport = p_sport
  ),
  season_values AS (
    SELECT s.player_id,
           coalesce(CASE WHEN s.max_starts > 0 THEN s.starts::numeric / s.max_starts
                         WHEN s.max_minutes > 0 THEN s.minutes::numeric / s.max_minutes END, 0)
           * coalesce(csp.score, 0) / 100.0 AS v
      FROM squad s
      LEFT JOIN club_season_prestige csp
        ON csp.sport = p_sport AND csp.club_id = s.club_id AND csp.season = s.season
  ),
  club AS (
    SELECT r.player_id, sum(r.v) AS best
      FROM (SELECT sv.player_id, sv.v,
                   row_number() OVER (PARTITION BY sv.player_id ORDER BY sv.v DESC) AS rn
              FROM season_values sv) r
     WHERE r.rn <= BEST_SEASONS
     GROUP BY r.player_id
  ),
  -- Caps per nation, weighted. The bag is open and written by scripts: an entry counts only
  -- when it is a non-negative number.
  intl AS (
    SELECT pf.player_id, sum(greatest(0, (c.value #>> '{}')::numeric) * coalesce(nt.weight, DEFAULT_TIER)) AS weighted
      FROM player_fame pf
     CROSS JOIN LATERAL jsonb_each(
             CASE WHEN jsonb_typeof(pf.details -> 'capsByNation') = 'object'
                  THEN pf.details -> 'capsByNation' ELSE '{}'::jsonb END) AS c
      LEFT JOIN nation_tiers nt ON nt.sport = p_sport AND nt.nation = c.key
     WHERE pf.sport = p_sport
       AND jsonb_typeof(c.value) = 'number'
     GROUP BY pf.player_id
  ),
  pillars AS (
    SELECT pf.player_id,
           least(1, coalesce(ca.games, 0) / cal.k_games) AS l,
           least(1, coalesce(cl.best, 0) / greatest(least(coalesce(ca.seasons, 0), BEST_SEASONS), MIN_SEASONS)
                    / cal.k_club) AS p_club,
           least(1, sqrt(coalesce(i.weighted, 0) / greatest(coalesce(ca.seasons, 0), MIN_SEASONS) / cal.k_rate)) AS p_intl,
           -- No Wikipedia match → unknown (NULL), not 0. A match with no views → 0.
           -- IS DISTINCT FROM, not <>: a missing key gives NULL, and `NULL <> 'string'` is not
           -- true — the CASE would fall through to greatest(0, NULL) = 0, an unknown read as 0.
           CASE WHEN jsonb_typeof(pf.details -> 'wikidataId') IS DISTINCT FROM 'string' THEN NULL
                WHEN jsonb_typeof(pf.details -> 'viewsPerYear') IS DISTINCT FROM 'number' THEN NULL
                WHEN (pf.details ->> 'viewsPerYear')::numeric <= 0 THEN 0
                ELSE least(1, greatest(0, (log((pf.details ->> 'viewsPerYear')::numeric) - 2)
                                          / (log(cal.v_max) - 2)))
           END AS e
      FROM player_fame pf
      LEFT JOIN career ca ON ca.player_id = pf.player_id
      LEFT JOIN club   cl ON cl.player_id = pf.player_id
      LEFT JOIN intl   i  ON i.player_id  = pf.player_id
     WHERE pf.sport = p_sport
  )
  UPDATE player_fame f
     SET score = round(100 * CASE
                   WHEN p.e IS NULL THEN (0.15 * p.l + 0.20 * p.p_club + 0.20 * p.p_intl) / 0.55
                   ELSE 0.15 * p.l + 0.20 * p.p_club + 0.20 * p.p_intl + 0.45 * p.e END)::integer,
         terms = jsonb_build_object('longevity', round(p.l, 2), 'club', round(p.p_club, 2),
                                    'intl', round(p.p_intl, 2), 'exposure', round(p.e, 2)),
         revision       = FAME_REVISION,
         last_update_at = now()
    FROM pillars p
   WHERE f.sport = p_sport
     AND f.player_id = p.player_id;

  GET DIAGNOSTICS scored = ROW_COUNT;
  RETURN scored;
END;
$$;

-- Writes, so closed to the public roles (the 013 posture). compute_fame_scores keeps its grant
-- from 012.
ALTER TABLE nation_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read nation_tiers" ON nation_tiers FOR SELECT USING (true);
GRANT SELECT ON nation_tiers TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON nation_tiers TO service_role;

REVOKE EXECUTE ON FUNCTION public.apply_membership_stats(text, jsonb)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_nation_tiers(text, text, jsonb)   FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_membership_stats(text, jsonb)       TO service_role;
GRANT  EXECUTE ON FUNCTION public.replace_nation_tiers(text, text, jsonb)   TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
--   SELECT * FROM fame_calibration;
--     -- rugby 260 / 7.5 / 0.45 / 1000000 ; football 550 / 9 / 0.47 / 15000000
--   SELECT sport, count(*) FROM nation_tiers GROUP BY sport;   -- rugby 43 before any import
--   SELECT count(*) FROM club_titles t WHERE t.sport = 'rugby' AND NOT EXISTS
--     (SELECT 1 FROM memberships m WHERE m.sport = t.sport AND m.club_id = t.club_id AND m.season = t.season);
--     -- 0: every rugby title sits on a squad of the graph
--
-- After seed:fame, seed:prestige and fame:exposure of each sport (in that order of usefulness:
-- each recomputes the scores, so the last one leaves the final state):
--
--   SELECT sport, array_agg(DISTINCT revision) FROM player_fame GROUP BY sport;      -- {3}
--   SELECT sport, count(*) FILTER (WHERE starts IS NOT NULL OR minutes IS NOT NULL), count(*)
--     FROM memberships GROUP BY sport;                                               -- ~99%
--   SELECT sport, count(*) FILTER (WHERE terms ->> 'exposure' IS NOT NULL), count(*)
--     FROM player_fame GROUP BY sport;                          -- rugby ~59%, football ~98%
--
-- Then npm run fame:report -- --sport=rugby (and football): the named top/bottom 30 with their
-- pillars. The daily draw band (019, 60..80) is not moved by this migration: measured on the
-- prototype it holds 307 rugby and 339 football players — review it with the floors.
