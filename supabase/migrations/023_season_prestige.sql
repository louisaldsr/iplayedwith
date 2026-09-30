-- Gives every club-season a prestige score: "how much of a spotlight was this squad under".
--
-- Fame v2 reads caps, games and caps per season: it measures a career, not where it was played.
-- A long-serving player at a small club ranks like one at a giant, and nothing says that
-- Toulouse 2023-24 or Real Madrid 2016-17 were watched by everyone (docs/spikes/fame.md,
-- "Revision 3"). This migration scores the stage; 025_fame_stage.sql feeds it into player fame.
--
-- ─── Why a club-SEASON, not a club ────────────────────────────────────────────
--
-- People remember a season: its big European nights, the title, and the squad that played
-- them. A title is attached to its own season, so the squads before and after do not get it,
-- and there is no recency decay to invent: an old title still belongs to the players who won it.
--
-- The value is the same for every player of the squad, so it lives here and not on
-- `memberships`. What is personal stays there: the player's games, which weight the average.
--
-- ─── The formula (revision 1) ─────────────────────────────────────────────────
--
--   run(c,t)  = 0.65 · s(continental(c,t), k_continental) + 0.35 · min(1, titles(c,t))
--   brand(c)  = mean of run(c,·) over the club's seasons in the graph
--   prestige  = round(100 × [ 0.70 · run(c,t) + 0.30 · brand(c) ])
--   s(x, K)   = min(1, √(x / K))                          — the player-fame shape
--
--   continental = Σ continental WINS that season × wins_weight of the competition
--   titles      = Σ title_weight of the titles won that season
--
-- Measured on the data before writing it:
--
-- - The continental stage is the best signal held. Summed over 2012-2025, European games rank
--   Real 170, Bayern 160, PSG 148 in football, and Leinster 97, Toulouse 81, Munster 81 in rugby.
-- - It counts WINS, not games. A first version counted games and rewarded taking part: Zebre
--   2016-17 (6 Champions Cup games, 0 wins) scored 48, next to Munster, and every Super Rugby
--   franchise sat at 35-46 for playing its ~15 league games — the Sunwolves above Pau and
--   Bayonne. Wins tell those squads apart: Zebre 0 against Toulouse 2023-24's 8, the Sunwolves
--   2 against the Crusaders 2017's 17. A draw counts for nothing.
-- - Competitions are WEIGHTED: Man Utd won as many games taking the 2016-17 Europa League as a
--   Champions League finalist.
-- - A season alone is not enough. Man Utd 2014-15, Chelsea 2016-17 (league champions) and
--   AC Milan 2014 to 2016 played no European game, and their squads were still watched by
--   everyone. `brand` carries 30% of the club's standing over into every one of its seasons.
--
-- Rejected (docs/spikes/fame.md): Wikipedia editions per club (flat in rugby: Toulouse =
-- Leinster = Crusaders = 21), squad caps (crowns Jaguares, Drua, Zebre), attendance (football
-- only).
--
-- Absolute like player fame: a club-season's score depends on that club only, never on a
-- cohort. `brand` averages the club's OWN seasons, so importing another club moves nothing.
--
-- ─── What lives where ─────────────────────────────────────────────────────────
--
--   prestige_competitions — the weights, in DATA: the formula never branches on the sport
--   club_titles           — who won what, one winner per competition-season
--   club_season_prestige  — `details` (the imported signals) + `score` (the output)
--
-- Depends on 006_sport_space.sql (clubs_id_sport_key) and 014_fame_rate.sql (fame_calibration).
-- Apply as ONE transaction. Rollback: 023_season_prestige_rollback.sql.
--
-- Then: 024_seed_rugby_titles.sql, then 025_fame_stage.sql, then the imports
--   rugby    : npm run seed:prestige            (run from the checkout with the profile cache)
--   football : npm run seed:football:prestige

BEGIN;

-- ─── The weights ──────────────────────────────────────────────────────────────

-- One row per competition that counts. A competition missing here weighs 0 by construction,
-- which is the right default for the dozens of domestic cups and leagues that say nothing
-- about a spotlight.
--
-- `wins_weight`  — what one win in it adds to `continental`. Non-zero only for competitions
--   that put a club in front of more than its own league.
-- `title_weight` — what winning it adds to `titles`, which saturates at 1: the continental
--   title alone takes the whole term, a domestic one takes most of it.
CREATE TABLE prestige_competitions (
  sport         text    NOT NULL,
  competition   text    NOT NULL,
  wins_weight   numeric NOT NULL DEFAULT 0,
  title_weight  numeric NOT NULL DEFAULT 0,

  PRIMARY KEY (sport, competition),

  CONSTRAINT prestige_competitions_sport_check   CHECK (sport IN ('rugby', 'football')),
  CONSTRAINT prestige_competitions_weights_check
    CHECK (wins_weight BETWEEN 0 AND 1 AND title_weight BETWEEN 0 AND 1)
);

-- Labels are the canonical names the import scripts write (scripts/*/lib/prestige.ts): the
-- sources spell them several ways ("H Cup", "Super Rugby Pacific", "CL"), the scripts fold them.
INSERT INTO prestige_competitions (sport, competition, wins_weight, title_weight) VALUES
  -- Rugby, northern hemisphere: the two European cups, then the three leagues that feed them.
  ('rugby',    'Champions Cup',             1.00, 1.00),
  ('rugby',    'Challenge Cup',             0.50, 0.50),
  ('rugby',    'Top 14',                    0.00, 0.60),
  ('rugby',    'Premiership',               0.00, 0.60),
  ('rugby',    'United Rugby Championship', 0.00, 0.60),
  -- Rugby, southern hemisphere: Super Rugby is already transnational and nothing sits above
  -- it, so its title weighs a European Cup. Its wins are a league's, over ~15 games a season:
  -- at 0.25, the Crusaders' 17 wins of 2017 read like a Champions Cup quarter-final, the
  -- Sunwolves' 2 like nothing. Without them every Super Rugby squad would score 0 on the term
  -- European clubs fill.
  ('rugby',    'Super Rugby',               0.25, 1.00),
  -- Football: the three UEFA club competitions, then the Big 5 leagues.
  ('football', 'Champions League',          1.00, 1.00),
  ('football', 'Europa League',             0.50, 0.50),
  ('football', 'Conference League',         0.25, 0.25),
  ('football', 'Premier League',            0.00, 0.60),
  ('football', 'LaLiga',                    0.00, 0.60),
  ('football', 'Serie A',                   0.00, 0.60),
  ('football', 'Bundesliga',                0.00, 0.60),
  ('football', 'Ligue 1',                   0.00, 0.60);

-- ─── Who won what ─────────────────────────────────────────────────────────────

-- The PK is the invariant: a competition-season has ONE winner. A second row for the same
-- title is refused, not averaged.
--
-- The FK to prestige_competitions refuses a title in a competition that has no weight — it
-- would otherwise land silently at 0.
--
-- `source` says who wrote the row, so each writer replaces only its own: rugby titles come
-- from a curated seed (024), football titles are derived from the Transfermarkt games.
CREATE TABLE club_titles (
  sport        text NOT NULL,
  competition  text NOT NULL,
  season       text NOT NULL CHECK (season ~ '^\d{4}-\d{4}$'),
  club_id      text NOT NULL,
  source       text NOT NULL,

  PRIMARY KEY (sport, competition, season),

  CONSTRAINT club_titles_competition_fkey
    FOREIGN KEY (sport, competition) REFERENCES prestige_competitions (sport, competition)
    ON UPDATE CASCADE,
  CONSTRAINT club_titles_club_sport_fkey
    FOREIGN KEY (club_id, sport) REFERENCES clubs (id, sport)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX club_titles_club_idx ON club_titles (sport, club_id, season);

-- ─── The score ────────────────────────────────────────────────────────────────

-- Same shape as player_fame (010): the inputs in an open bag, the output next to them, and
-- the revision that produced it. Read that migration's header for why it is not a generated
-- column.
CREATE TABLE club_season_prestige (
  sport           text NOT NULL,
  club_id         text NOT NULL,
  season          text NOT NULL CHECK (season ~ '^\d{4}-\d{4}$'),

  -- The INPUTS: {"continentalWins": {"Champions Cup": 8}}.
  -- `continentalWins` is the club's run, per competition, as the import measured it. Titles
  -- are not here: they have their own table and their own writers. No `updatedAt`, unlike
  -- player_fame: every import replaces the whole sport, so no row can be left behind by one.
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The OUTPUT, 0..100. NULL until computed, and for a club-season the graph no longer has.
  score           integer,
  revision        smallint,
  last_update_at  timestamptz,

  PRIMARY KEY (sport, club_id, season),

  CONSTRAINT club_season_prestige_score_range_check    CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  CONSTRAINT club_season_prestige_scored_check
    CHECK ((score IS NULL) = (revision IS NULL)
       AND (score IS NULL) = (last_update_at IS NULL)),
  CONSTRAINT club_season_prestige_details_object_check CHECK (jsonb_typeof(details) = 'object'),

  CONSTRAINT club_season_prestige_club_sport_fkey
    FOREIGN KEY (club_id, sport) REFERENCES clubs (id, sport)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- The saturation point of `continental`, in weighted wins: a title run. Per sport, like every
-- other K — rugby 8 (Toulouse 2023-24 won all 8 Champions Cup games, Leinster 2017-18 all 9),
-- football 10 (a Champions League winner wins 9 to 11 of its 13 to 17 games).
ALTER TABLE fame_calibration ADD COLUMN k_continental numeric;
UPDATE fame_calibration SET k_continental = 8  WHERE sport = 'rugby';
UPDATE fame_calibration SET k_continental = 10 WHERE sport = 'football';
-- A sport calibrated earlier but not listed above would be left NULL: fail here, not at compute.
ALTER TABLE fame_calibration ALTER COLUMN k_continental SET NOT NULL;
ALTER TABLE fame_calibration
  ADD CONSTRAINT fame_calibration_k_continental_positive_check CHECK (k_continental > 0);

-- Same posture as every table since 001: public reads, writes reserved to service_role.
ALTER TABLE prestige_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_titles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_season_prestige  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read prestige_competitions" ON prestige_competitions FOR SELECT USING (true);
CREATE POLICY "public read club_titles"           ON club_titles           FOR SELECT USING (true);
CREATE POLICY "public read club_season_prestige"  ON club_season_prestige  FOR SELECT USING (true);

GRANT SELECT ON prestige_competitions, club_titles, club_season_prestige TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON prestige_competitions, club_titles, club_season_prestige TO service_role;

-- ─── Writing the signals ──────────────────────────────────────────────────────

-- Replaces the continental runs of a whole sport in ONE call, so an import cannot leave half
-- a sport on the old runs. First every row loses its `continentalWins`, then the new runs are
-- written: a club-season that had a European run in an old import but none now is back to 0,
-- instead of keeping a stale run nobody rewrote.
--
-- Only club-seasons the graph knows are written (the EXISTS on memberships): a profile lists
-- seasons before the data starts and clubs no membership reached, and a prestige row for them
-- would score a squad nobody can play. They are skipped, and the caller reports the gap
-- between rows sent and rows written.
--
-- `p_rows`: [{"club_id": "...", "season": "2023-2024", "wins": {"Champions Cup": 8}}, ...]
CREATE FUNCTION public.replace_continental_wins(p_sport text, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  written integer;
BEGIN
  UPDATE club_season_prestige
     SET details = details - 'continentalWins'
   WHERE sport = p_sport;

  WITH input AS (
    SELECT DISTINCT ON (e.elem ->> 'club_id', e.elem ->> 'season')
           e.elem ->> 'club_id'                  AS club_id,
           e.elem ->> 'season'                   AS season,
           coalesce(e.elem -> 'wins', '{}'::jsonb) AS wins
      FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(elem, ord)
     ORDER BY e.elem ->> 'club_id', e.elem ->> 'season', e.ord DESC
  )
  INSERT INTO club_season_prestige (sport, club_id, season, details)
  SELECT p_sport, i.club_id, i.season,
         jsonb_build_object('continentalWins', i.wins)
    FROM input i
   WHERE EXISTS (SELECT 1 FROM memberships m
                  WHERE m.sport = p_sport AND m.club_id = i.club_id AND m.season = i.season)
      ON CONFLICT (sport, club_id, season) DO UPDATE
     SET details = club_season_prestige.details || EXCLUDED.details;

  GET DIAGNOSTICS written = ROW_COUNT;
  RETURN written;
END;
$$;

-- Replaces every title ONE writer owns for a sport, in one call: the football import derives
-- the titles again on each run, and a title it no longer derives must not survive it. Rows of
-- another source (the curated rugby seed) are never touched.
--
-- Unknown clubs and competitions are skipped (the EXISTS guards), not fatal, so the caller
-- can report them. A second winner for a competition-season fails the call: that is a bug in
-- the derivation, not something to paper over.
--
-- `p_rows`: [{"club_id": "...", "season": "2016-2017", "competition": "Champions League"}, ...]
CREATE FUNCTION public.replace_club_titles(p_sport text, p_source text, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  written integer;
BEGIN
  DELETE FROM club_titles WHERE sport = p_sport AND source = p_source;

  INSERT INTO club_titles (sport, competition, season, club_id, source)
  SELECT p_sport, r.competition, r.season, r.club_id, p_source
    FROM jsonb_to_recordset(p_rows) AS r(club_id text, season text, competition text)
   WHERE EXISTS (SELECT 1 FROM clubs c WHERE c.id = r.club_id AND c.sport = p_sport)
     AND EXISTS (SELECT 1 FROM prestige_competitions pc
                  WHERE pc.sport = p_sport AND pc.competition = r.competition);

  GET DIAGNOSTICS written = ROW_COUNT;
  RETURN written;
END;
$$;

-- ─── Computing the score ──────────────────────────────────────────────────────

-- Rewrites every club-season of the sport at once, like compute_fame_scores: never a mixed
-- state. Called by compute_fame_scores (025) before it reads the scores, so a fame run can
-- never read stale prestige; callable alone to look at prestige before touching fame.
--
-- The club-seasons are the ones `memberships` holds — exactly the squads the graph is built
-- from. A row left over from a club-season that disappeared keeps its `details` (they are
-- imported data) but loses its score.
CREATE FUNCTION public.compute_season_prestige(p_sport text)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  -- Bump on ANY change to the formula below, to prestige_competitions or to k_continental.
  PRESTIGE_REVISION CONSTANT smallint := 1;
  kc      numeric;
  scored  integer;
BEGIN
  SELECT k_continental INTO kc FROM fame_calibration WHERE sport = p_sport;
  -- `least(1, NULL)` is 1 in Postgres: a missing constant would crown every club-season with a
  -- full continental term. The column is NOT NULL, so only a missing row is left to catch.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compute_season_prestige: no fame_calibration row for sport %', p_sport;
  END IF;

  INSERT INTO club_season_prestige (sport, club_id, season)
  SELECT DISTINCT m.sport, m.club_id, m.season FROM memberships m WHERE m.sport = p_sport
      ON CONFLICT (sport, club_id, season) DO NOTHING;

  UPDATE club_season_prestige p
     SET score = NULL, revision = NULL, last_update_at = NULL
   WHERE p.sport = p_sport
     AND NOT EXISTS (SELECT 1 FROM memberships m
                      WHERE m.sport = p_sport AND m.club_id = p.club_id AND m.season = p.season);

  WITH squads AS (
    SELECT DISTINCT m.club_id, m.season FROM memberships m WHERE m.sport = p_sport
  ),
  continental AS (
    -- The bag is open and written by scripts: an entry counts only when it is a number, and
    -- a competition with no weight row counts for nothing.
    SELECT p.club_id, p.season,
           sum(greatest(0, (w.value #>> '{}')::numeric) * pc.wins_weight) AS wins
      FROM club_season_prestige p
     CROSS JOIN LATERAL jsonb_each(
             CASE WHEN jsonb_typeof(p.details -> 'continentalWins') = 'object'
                  THEN p.details -> 'continentalWins' ELSE '{}'::jsonb END) AS w
      JOIN prestige_competitions pc ON pc.sport = p.sport AND pc.competition = w.key
     WHERE p.sport = p_sport
       AND jsonb_typeof(w.value) = 'number'
     GROUP BY p.club_id, p.season
  ),
  titles AS (
    SELECT t.club_id, t.season, sum(pc.title_weight) AS weight
      FROM club_titles t
      JOIN prestige_competitions pc ON pc.sport = t.sport AND pc.competition = t.competition
     WHERE t.sport = p_sport
     GROUP BY t.club_id, t.season
  ),
  runs AS (
    SELECT s.club_id, s.season,
           0.65 * least(1, sqrt(coalesce(c.wins, 0) / kc))
         + 0.35 * least(1, coalesce(t.weight, 0)) AS run
      FROM squads s
      LEFT JOIN continental c ON c.club_id = s.club_id AND c.season = s.season
      LEFT JOIN titles t      ON t.club_id = s.club_id AND t.season = s.season
  ),
  brands AS (
    SELECT r.club_id, avg(r.run) AS brand FROM runs r GROUP BY r.club_id
  )
  UPDATE club_season_prestige p
     SET score          = round(100 * (0.70 * r.run + 0.30 * b.brand))::integer,
         revision       = PRESTIGE_REVISION,
         last_update_at = now()
    FROM runs r
    JOIN brands b ON b.club_id = r.club_id
   WHERE p.sport = p_sport
     AND p.club_id = r.club_id
     AND p.season = r.season;

  GET DIAGNOSTICS scored = ROW_COUNT;
  RETURN scored;
END;
$$;

-- Writes, so closed to the public roles — the 013 posture (a function is executable by
-- PUBLIC by default).
REVOKE EXECUTE ON FUNCTION public.replace_continental_wins(text, jsonb)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_club_titles(text, text, jsonb)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_season_prestige(text)              FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.replace_continental_wins(text, jsonb)      TO service_role;
GRANT  EXECUTE ON FUNCTION public.replace_club_titles(text, text, jsonb)     TO service_role;
GRANT  EXECUTE ON FUNCTION public.compute_season_prestige(text)              TO service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
--   SELECT * FROM fame_calibration;                 -- k_continental: rugby 8, football 10
--   SELECT * FROM prestige_competitions ORDER BY sport, wins_weight DESC, title_weight DESC;
--
-- After 024, 025 and both prestige imports:
--   SELECT sport, count(*), count(score), array_agg(DISTINCT revision) FROM club_season_prestige GROUP BY sport;
--
-- Then npm run prestige:report -- --sport=rugby (and football): the top club-seasons must be the
-- title and final runs, and a giant's quiet season must stay above a promoted club's.
