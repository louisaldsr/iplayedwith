-- Basketball's fame and prestige constants — the data rows the sport-agnostic formulas of 023 and
-- 025 need before `compute_fame_scores('basketball')` can run. No formula changes.
--
-- ─── Prestige competitions ────────────────────────────────────────────────────
--
--   NBA Playoffs — wins_weight 1: the playoffs are basketball's stage beyond the regular season,
--                  the part of a European run in football. The import writes each club-season's
--                  playoff wins under this name (scripts/basketball/seedPrestige.ts).
--   NBA          — title_weight 1: winning the Finals, the top title, like Super Rugby's in rugby.
--
-- ─── Calibration, measured on the 1979-80 → 2025-26 dataset ───────────────────
--
-- Same rule as rugby and football (docs/spikes/fame.md, "Ceilings"): the per-season measures
-- saturate at the sport's p99, views at its single biggest star, career games above the p99 so
-- that long veterans do not all tie. Measured in a local Postgres loaded with the dataset:
--
--   k_games        1700 — career games, regular season + playoffs: p99 1,366, max 1,924
--   k_club         0.50 — best-seasons club measure: p99 0.50 (rugby 0.45, football 0.47)
--   k_rate         15   — FIBA senior caps × nation tier per NBA season: p99 15 over every player
--                         (EuroLeague stars with short NBA careers top it: Navarro 43); gives
--                         Gasol 0.66, Parker 0.61, LeBron 0.38, Jordan 0.27 on the pillar
--   k_continental  16   — a modern title run, four best-of-seven series (a 1984-2002 champion
--                         won 15, 0.97 of the term)
--   v_max          8,000,000 — LeBron James, en + fr views a year over 36 months (8.06M)
--   k_caps         100  — not read since revision 3; NOT NULL, kept for 025's rollback
--
-- What it produced locally (all inputs, exposure included): LeBron 88, Parker 83, Kobe 82, Durant 81,
-- Jordan / Gasol / O'Neal 80; one-game players at the bottom. The daily draw band (60..80) holds
-- 114 players — a narrower pool than rugby's or football's (~300), all of them well known.
--
-- A new sport's row changes no other sport's score, so FAME_REVISION stays at 3.
--
-- Depends on 027_sports_table.sql: before it, the 023 CHECK on prestige_competitions refuses any
-- sport but rugby and football. Re-runnable. Rollback: 029_basketball_fame_rollback.sql.

BEGIN;

INSERT INTO prestige_competitions (sport, competition, wins_weight, title_weight) VALUES
  ('basketball', 'NBA Playoffs', 1.0, 0.0),
  ('basketball', 'NBA',          0.0, 1.0)
ON CONFLICT (sport, competition) DO UPDATE
  SET wins_weight = EXCLUDED.wins_weight, title_weight = EXCLUDED.title_weight;

INSERT INTO fame_calibration (sport, k_games, k_caps, k_rate, k_continental, k_club, v_max)
VALUES ('basketball', 1700, 100, 15, 16, 0.50, 8000000)
ON CONFLICT (sport) DO UPDATE
  SET k_games = EXCLUDED.k_games, k_caps = EXCLUDED.k_caps, k_rate = EXCLUDED.k_rate,
      k_continental = EXCLUDED.k_continental, k_club = EXCLUDED.k_club, v_max = EXCLUDED.v_max;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
--   SELECT * FROM fame_calibration WHERE sport = 'basketball';
--   SELECT * FROM prestige_competitions WHERE sport = 'basketball';   -- 2 rows
--
-- After seed:basketball:fame, :prestige and fame:exposure -- --sport=basketball:
--
--   SELECT count(*), count(score), min(score), max(score) FROM player_fame WHERE sport = 'basketball';
--   SELECT count(*) FROM club_titles WHERE sport = 'basketball';       -- 47
--   SELECT f.score >= 60 AND f.score <= 80 AS in_band, count(*)        -- the daily draw band (019)
--     FROM player_fame f WHERE f.sport = 'basketball' GROUP BY 1;
--
-- Then npm run fame:report -- --sport=basketball, and read the named top/bottom 30.
