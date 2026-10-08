-- Formula 1 as a sport: its row in `sports`, and the fame and prestige constants the
-- sport-agnostic formulas of 023 and 025 need before `compute_fame_scores('formula1')` can run.
-- No formula changes.
--
-- ─── The sport ────────────────────────────────────────────────────────────────
--
--   ('formula1', 'calendar') — one season per calendar year, "2025" (030). The id is the one the
--   app's SPORTS list and the import scripts use (scripts/formula1/).
--
-- ─── Prestige competitions ────────────────────────────────────────────────────
--
--   Grand Prix wins             — wins_weight 1: a constructor's wins that season play the part of
--                                 a European run. Scaled by the import to a 20-race season (1950
--                                 had 7 Grands Prix, 2024 had 24), so eras compare.
--   Constructors' Championship  — title_weight 1: the title, from 1958.
--
-- ─── Calibration, measured on the 1950 → 2025 dataset ─────────────────────────
--
-- Same rule as the other sports (docs/spikes/fame.md, "Ceilings"): the per-season measures saturate
-- at the sport's p99, views at its biggest star, career games above the p99. Measured on a local
-- Postgres loaded with the dataset and running the 023 / 025 functions as they are:
--
--   k_games        350  — career starts: p99 280, max 427 (Alonso). Hamilton and Alonso saturate,
--                         Schumacher 0.88
--   k_club         0.70 — best-seasons team measure: p99 0.71, max 0.87
--   k_rate         8    — the "international" pillar holds the driver's own results, F1 having no
--                         national team: podiums scaled to a 20-race season, per season. p99 8.1,
--                         max 12.5. Written by scripts/formula1/seedFame.ts under one entry,
--                         'World Championship', weighted 1 in nation_tiers
--   k_continental  12   — a constructors' champion wins 10.5 races in 20 (median; p25 8, p75 13):
--                         0.94 of the term, as a basketball title run is 0.97
--   v_max          5,500,000 — Lewis Hamilton, en + fr views a year over 36 months (5.44M)
--   k_caps         100  — not read since revision 3; NOT NULL, kept for 025's rollback
--
-- What it produced locally (exposure included, 712 of 714 drivers matched to Wikipedia):
-- Hamilton 100, Schumacher 97, Verstappen 92, Vettel 91, Senna 90, Räikkönen 87, Prost / Alonso 86;
-- Clark 73, Fangio 72, Moss 69. Floors: 30 famous, 163 known, 521 unsung. The daily draw band
-- (60..80) holds 40 drivers — narrower than any other sport, all of them well known (Hunt, Gilles
-- Villeneuve, Ascari, Häkkinen, Leclerc, Norris…).
--
-- A new sport's row changes no other sport's score, so FAME_REVISION stays at 3.
--
-- Depends on 030_calendar_seasons.sql (sports.season_format). Apply BEFORE seed:formula1:clubs —
-- every Formula 1 row refers to this sport. Re-runnable. Rollback: 031_formula1_rollback.sql.

BEGIN;

INSERT INTO sports (id, season_format) VALUES ('formula1', 'calendar')
ON CONFLICT (id) DO NOTHING;

INSERT INTO prestige_competitions (sport, competition, wins_weight, title_weight) VALUES
  ('formula1', 'Grand Prix wins',             1.0, 0.0),
  ('formula1', 'Constructors'' Championship', 0.0, 1.0)
ON CONFLICT (sport, competition) DO UPDATE
  SET wins_weight = EXCLUDED.wins_weight, title_weight = EXCLUDED.title_weight;

INSERT INTO fame_calibration (sport, k_games, k_caps, k_rate, k_continental, k_club, v_max)
VALUES ('formula1', 350, 100, 8, 12, 0.70, 5500000)
ON CONFLICT (sport) DO UPDATE
  SET k_games = EXCLUDED.k_games, k_caps = EXCLUDED.k_caps, k_rate = EXCLUDED.k_rate,
      k_continental = EXCLUDED.k_continental, k_club = EXCLUDED.k_club, v_max = EXCLUDED.v_max;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
--   SELECT * FROM sports WHERE id = 'formula1';                        -- calendar
--   SELECT * FROM fame_calibration WHERE sport = 'formula1';
--   SELECT * FROM prestige_competitions WHERE sport = 'formula1';      -- 2 rows
--
-- After the import (seed:formula1:clubs → :players → :memberships → :fame → :prestige, then
-- fame:exposure -- --sport=formula1):
--
--   SELECT count(*), count(score), min(score), max(score) FROM player_fame WHERE sport = 'formula1';
--   -- 714 drivers
--   SELECT count(*) FROM club_titles WHERE sport = 'formula1';         -- 68
--   SELECT f.score >= 60 AND f.score <= 80 AS in_band, count(*)        -- the daily draw band (019)
--     FROM player_fame f WHERE f.sport = 'formula1' GROUP BY 1;        -- ~40 in the band
--
-- Then npm run fame:report -- --sport=formula1, and read the named top/bottom 30.
