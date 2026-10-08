-- Seasons inside one calendar year ("2025"), next to the seasons across two ("2025-2026") — the
-- shape Formula 1 needs — and a guarantee that a sport never mixes the two.
--
-- ─── Why ──────────────────────────────────────────────────────────────────────
--
-- Every season so far was "YYYY-YYYY", enforced three times:
--
--   memberships_season_check           CHECK (season ~ '^\d{4}-\d{4}$')   — 001
--   club_titles_season_check           CHECK (season ~ '^\d{4}-\d{4}$')   — 023
--   club_season_prestige_season_check  CHECK (season ~ '^\d{4}-\d{4}$')   — 023
--
-- Formula 1 races one season per calendar year: its 2025 season is "2025". Storing it as
-- "2025-2026" would show players a season that never existed. So a season now reads either way:
--
--   split     "YYYY-YYYY", the end year exactly one after the start   rugby, football, basketball
--   calendar  "YYYY"                                                  formula 1
--
-- The app reads both through `Season` (src/domain/season.ts) and never branches on the sport.
--
-- ─── Where the invariant now lives ────────────────────────────────────────────
--
-- A sport uses ONE shape. Mixed, the same season would have two spellings ("2025" and
-- "2025-2026" for the same year), two players of it would never be teammates, and text order would
-- stop being year order (dailySolution sorts seasons as text). So:
--
--   sports.season_format                'split' (the default: every sport so far) | 'calendar'
--   <table>.season_format               GENERATED from the season's own shape
--   FK (sport, season_format)           → sports (id, season_format)
--
-- on memberships, club_titles and club_season_prestige — the three tables that store a season.
-- A season of the wrong shape for its sport cannot be written. Same pattern as 006's composite FKs.
--
-- The CHECKs also gain the range rule the app already had: "2022-2024" is refused, not only by
-- `Season`. A CASE, not an AND: Postgres does not promise to test the regex before the casts.
--
-- A new calendar sport is one row: INSERT INTO sports (id, season_format) VALUES ('formula1',
-- 'calendar'). Changing the format of a sport that has rows fails on the FK, as it must.
--
-- ─── Apply ────────────────────────────────────────────────────────────────────
--
-- Check the constraint names first. The DROPs below are `IF EXISTS`, so a name that drifted
-- would be skipped SILENTLY and leave the old CHECK behind (and the calendar shape refused):
--
--   SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname LIKE '%season_check';
--   -- expect exactly the three listed above
--
-- And that no stored season breaks the range rule (the new CHECKs would abort the migration):
--
--   SELECT 'memberships', season FROM memberships
--    WHERE right(season, 4)::int <> left(season, 4)::int + 1
--   UNION ALL SELECT 'club_titles', season FROM club_titles
--    WHERE right(season, 4)::int <> left(season, 4)::int + 1
--   UNION ALL SELECT 'club_season_prestige', season FROM club_season_prestige
--    WHERE right(season, 4)::int <> left(season, 4)::int + 1;
--   -- expect 0 rows
--
-- The generated column REWRITES each table, memberships included (~100k rows): a few seconds
-- under an exclusive lock — moves and imports wait, they do not fail.
--
-- Apply as ONE transaction in the Supabase SQL editor. Re-runnable.
-- Rollback: 030_calendar_seasons_rollback.sql.

BEGIN;

-- ─── sports ───────────────────────────────────────────────────────────────────

ALTER TABLE sports
  ADD COLUMN IF NOT EXISTS season_format text NOT NULL DEFAULT 'split';

ALTER TABLE sports DROP CONSTRAINT IF EXISTS sports_season_format_check;
ALTER TABLE sports
  ADD CONSTRAINT sports_season_format_check CHECK (season_format IN ('split', 'calendar'));

-- The target of the composite FKs below.
ALTER TABLE sports DROP CONSTRAINT IF EXISTS sports_id_season_format_key CASCADE;
ALTER TABLE sports ADD CONSTRAINT sports_id_season_format_key UNIQUE (id, season_format);

-- ─── memberships ──────────────────────────────────────────────────────────────

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_season_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_season_check CHECK (
  CASE
    WHEN season ~ '^\d{4}$' THEN true
    WHEN season ~ '^\d{4}-\d{4}$' THEN right(season, 4)::int = left(season, 4)::int + 1
    ELSE false
  END
);

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS season_format text
  GENERATED ALWAYS AS (CASE WHEN season ~ '^\d{4}$' THEN 'calendar' ELSE 'split' END) STORED;

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_season_format_fkey;
ALTER TABLE memberships
  ADD CONSTRAINT memberships_season_format_fkey
    FOREIGN KEY (sport, season_format) REFERENCES sports (id, season_format);

-- ─── club_titles ──────────────────────────────────────────────────────────────

ALTER TABLE club_titles DROP CONSTRAINT IF EXISTS club_titles_season_check;
ALTER TABLE club_titles ADD CONSTRAINT club_titles_season_check CHECK (
  CASE
    WHEN season ~ '^\d{4}$' THEN true
    WHEN season ~ '^\d{4}-\d{4}$' THEN right(season, 4)::int = left(season, 4)::int + 1
    ELSE false
  END
);

ALTER TABLE club_titles ADD COLUMN IF NOT EXISTS season_format text
  GENERATED ALWAYS AS (CASE WHEN season ~ '^\d{4}$' THEN 'calendar' ELSE 'split' END) STORED;

ALTER TABLE club_titles DROP CONSTRAINT IF EXISTS club_titles_season_format_fkey;
ALTER TABLE club_titles
  ADD CONSTRAINT club_titles_season_format_fkey
    FOREIGN KEY (sport, season_format) REFERENCES sports (id, season_format);

-- ─── club_season_prestige ─────────────────────────────────────────────────────

ALTER TABLE club_season_prestige DROP CONSTRAINT IF EXISTS club_season_prestige_season_check;
ALTER TABLE club_season_prestige ADD CONSTRAINT club_season_prestige_season_check CHECK (
  CASE
    WHEN season ~ '^\d{4}$' THEN true
    WHEN season ~ '^\d{4}-\d{4}$' THEN right(season, 4)::int = left(season, 4)::int + 1
    ELSE false
  END
);

ALTER TABLE club_season_prestige ADD COLUMN IF NOT EXISTS season_format text
  GENERATED ALWAYS AS (CASE WHEN season ~ '^\d{4}$' THEN 'calendar' ELSE 'split' END) STORED;

ALTER TABLE club_season_prestige DROP CONSTRAINT IF EXISTS club_season_prestige_season_format_fkey;
ALTER TABLE club_season_prestige
  ADD CONSTRAINT club_season_prestige_season_format_fkey
    FOREIGN KEY (sport, season_format) REFERENCES sports (id, season_format);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- Every sport is split, every stored season too:
--   SELECT id, season_format FROM sports ORDER BY id;
--   -- -> basketball, football, rugby: all 'split'
--   SELECT sport, season_format, count(*) FROM memberships GROUP BY 1, 2 ORDER BY 1;
--   -- -> one 'split' row per sport
--
-- The three CHECKs and the three FKs exist:
--   SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname LIKE '%season_check' OR conname LIKE '%season_format_fkey';
--   -- -> 6 rows
--
-- The guard works — each of these must FAIL, and the ROLLBACK keeps the base clean either way:
--   BEGIN;
--   INSERT INTO memberships (player_id, club_id, season, sport)
--   SELECT player_id, club_id, '2020', sport FROM memberships WHERE sport = 'rugby' LIMIT 1;
--   ROLLBACK;
--   -- -> foreign-key violation (memberships_season_format_fkey): rugby is split
--
--   BEGIN;
--   INSERT INTO memberships (player_id, club_id, season, sport)
--   SELECT player_id, club_id, '2020-2022', sport FROM memberships WHERE sport = 'rugby' LIMIT 1;
--   ROLLBACK;
--   -- -> check violation (memberships_season_check)
