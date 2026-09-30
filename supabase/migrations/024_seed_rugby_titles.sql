-- Seeds `club_titles` (created by 023) with the rugby titles since the data starts (2012-13).
--
-- Curated by hand rather than pulled from Wikidata: its "winner" statements were measured
-- incomplete (the Crusaders show 7 Super Rugby titles instead of 11+). Over the data window it is
-- about 80 facts, few enough to check one by one.
--
-- Same window as the players: nothing before 2012-13, where no membership exists to carry it.
--
-- Seasons follow the data's labels. A southern-hemisphere competition played in calendar year Y
-- is season (Y-1)-Y on allrugby.com, the source of every rugby membership: Super Rugby 2024 is
-- `2023-2024`. Checked on a Highlanders profile.
--
-- Deliberately left out:
-- - 2019-20 Top 14: not awarded (season stopped by COVID).
-- - Super Rugby 2020 and 2021 (seasons 2019-2020, 2020-2021): replaced by national competitions
--   (Aotearoa, AU, Trans-Tasman), none of which is Super Rugby.
-- - 2025-2026 (the latest season in the data): NOT FILLED IN. Add its six winners below once
--   checked, then re-apply this file (it is idempotent).
--
-- Clubs are resolved BY NAME through `search_normalize`, like 009: ids are import-generated and
-- differ per environment. A name that resolves to nothing is silently skipped — RUN THE
-- UNRESOLVED CHECK AT THE BOTTOM after applying.
--
-- Requires 023_season_prestige.sql. Safe to re-run: it replaces its own rows (source 'seed:024').

BEGIN;

DELETE FROM club_titles WHERE sport = 'rugby' AND source = 'seed:024';

INSERT INTO club_titles (sport, competition, season, club_id, source)
SELECT 'rugby', v.competition, v.season, c.id, 'seed:024'
FROM (VALUES
  -- ── European Rugby Champions Cup (Heineken Cup until 2013-14) ──
  ('Champions Cup', '2012-2013', 'RC Toulon'),
  ('Champions Cup', '2013-2014', 'RC Toulon'),
  ('Champions Cup', '2014-2015', 'RC Toulon'),
  ('Champions Cup', '2015-2016', 'Saracens Football Club'),
  ('Champions Cup', '2016-2017', 'Saracens Football Club'),
  ('Champions Cup', '2017-2018', 'Leinster Rugby'),
  ('Champions Cup', '2018-2019', 'Saracens Football Club'),
  ('Champions Cup', '2019-2020', 'Exeter Chiefs'),
  ('Champions Cup', '2020-2021', 'Stade Toulousain'),
  ('Champions Cup', '2021-2022', 'Stade Rochelais'),
  ('Champions Cup', '2022-2023', 'Stade Rochelais'),
  ('Champions Cup', '2023-2024', 'Stade Toulousain'),
  ('Champions Cup', '2024-2025', 'Union Bordeaux-Bègles'),

  -- ── European Rugby Challenge Cup (Amlin Challenge Cup until 2013-14) ──
  ('Challenge Cup', '2012-2013', 'Leinster Rugby'),
  ('Challenge Cup', '2013-2014', 'Northampton Saints'),
  ('Challenge Cup', '2014-2015', 'Gloucester Rugby'),
  ('Challenge Cup', '2015-2016', 'Montpellier Hérault Rugby'),
  ('Challenge Cup', '2016-2017', 'Stade Français Paris'),
  ('Challenge Cup', '2017-2018', 'Cardiff Rugby'),          -- then Cardiff Blues
  ('Challenge Cup', '2018-2019', 'ASM Clermont'),
  ('Challenge Cup', '2019-2020', 'Bristol Bears'),
  ('Challenge Cup', '2020-2021', 'Montpellier Hérault Rugby'),
  ('Challenge Cup', '2021-2022', 'Lyon OU Rugby'),
  ('Challenge Cup', '2022-2023', 'RC Toulon'),
  ('Challenge Cup', '2023-2024', 'Sharks Durban'),
  ('Challenge Cup', '2024-2025', 'Bath Rugby'),

  -- ── Top 14 ──
  ('Top 14', '2012-2013', 'Castres Olympique'),
  ('Top 14', '2013-2014', 'RC Toulon'),
  ('Top 14', '2014-2015', 'Stade Français Paris'),
  ('Top 14', '2015-2016', 'Racing 92'),
  ('Top 14', '2016-2017', 'ASM Clermont'),
  ('Top 14', '2017-2018', 'Castres Olympique'),
  ('Top 14', '2018-2019', 'Stade Toulousain'),
  ('Top 14', '2020-2021', 'Stade Toulousain'),
  ('Top 14', '2021-2022', 'Montpellier Hérault Rugby'),
  ('Top 14', '2022-2023', 'Stade Toulousain'),
  ('Top 14', '2023-2024', 'Stade Toulousain'),
  ('Top 14', '2024-2025', 'Stade Toulousain'),

  -- ── Premiership ──
  ('Premiership', '2012-2013', 'Leicester Tigers'),
  ('Premiership', '2013-2014', 'Northampton Saints'),
  ('Premiership', '2014-2015', 'Saracens Football Club'),
  ('Premiership', '2015-2016', 'Saracens Football Club'),
  ('Premiership', '2016-2017', 'Exeter Chiefs'),
  ('Premiership', '2017-2018', 'Saracens Football Club'),
  ('Premiership', '2018-2019', 'Saracens Football Club'),
  ('Premiership', '2019-2020', 'Exeter Chiefs'),
  ('Premiership', '2020-2021', 'Harlequin Football Club'),
  ('Premiership', '2021-2022', 'Leicester Tigers'),
  ('Premiership', '2022-2023', 'Saracens Football Club'),
  ('Premiership', '2023-2024', 'Northampton Saints'),
  ('Premiership', '2024-2025', 'Bath Rugby'),

  -- ── United Rugby Championship (Pro12 until 2016-17, then Pro14) ──
  ('United Rugby Championship', '2012-2013', 'Leinster Rugby'),
  ('United Rugby Championship', '2013-2014', 'Leinster Rugby'),
  ('United Rugby Championship', '2014-2015', 'Glasgow Warriors'),
  ('United Rugby Championship', '2015-2016', 'Connacht Rugby'),
  ('United Rugby Championship', '2016-2017', 'Scarlets'),
  ('United Rugby Championship', '2017-2018', 'Leinster Rugby'),
  ('United Rugby Championship', '2018-2019', 'Leinster Rugby'),
  ('United Rugby Championship', '2019-2020', 'Leinster Rugby'),
  ('United Rugby Championship', '2020-2021', 'Leinster Rugby'),
  ('United Rugby Championship', '2021-2022', 'Stormers'),
  ('United Rugby Championship', '2022-2023', 'Munster Rugby'),
  ('United Rugby Championship', '2023-2024', 'Glasgow Warriors'),
  ('United Rugby Championship', '2024-2025', 'Leinster Rugby'),

  -- ── Super Rugby (calendar year Y → season (Y-1)-Y) ──
  ('Super Rugby', '2012-2013', 'Waikato Chiefs'),           -- 2013
  ('Super Rugby', '2013-2014', 'New South Wales Waratahs'), -- 2014
  ('Super Rugby', '2014-2015', 'Highlanders'),              -- 2015
  ('Super Rugby', '2015-2016', 'Hurricanes'),               -- 2016
  ('Super Rugby', '2016-2017', 'Crusaders'),                -- 2017
  ('Super Rugby', '2017-2018', 'Crusaders'),                -- 2018
  ('Super Rugby', '2018-2019', 'Crusaders'),                -- 2019
  ('Super Rugby', '2021-2022', 'Crusaders'),                -- 2022
  ('Super Rugby', '2022-2023', 'Crusaders'),                -- 2023
  ('Super Rugby', '2023-2024', 'Blues'),                    -- 2024
  ('Super Rugby', '2024-2025', 'Crusaders')                 -- 2025
) AS v(competition, season, club_name)
JOIN clubs c
  ON c.sport = 'rugby'
 AND c.search_name = public.search_normalize(v.club_name);

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- 1. Every title landed — expect 75 rows (13 seasons × 5 northern competitions, minus the
--    2019-20 Top 14, plus 11 Super Rugby seasons):
--
--   SELECT competition, count(*) FROM club_titles WHERE sport = 'rugby' GROUP BY competition;
--
--    Fewer means a club name resolved to nothing: find it by re-running the VALUES list with
--    `WHERE NOT EXISTS (SELECT 1 FROM clubs c WHERE c.sport = 'rugby'
--                         AND c.search_name = public.search_normalize(v.club_name))`.
--
-- 2. The titles sit on squads the graph has (a title on a club-season with no membership
--    scores nobody). Expect 0 rows:
--
--   SELECT t.* FROM club_titles t
--    WHERE t.sport = 'rugby'
--      AND NOT EXISTS (SELECT 1 FROM memberships m
--                       WHERE m.sport = t.sport AND m.club_id = t.club_id AND m.season = t.season);
