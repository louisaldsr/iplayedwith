-- Undoes 030_calendar_seasons.sql, back to the 029 state.
--
-- Not destructive for data: the generated `season_format` columns are derived, and
-- `sports.season_format` only says what the seasons already show.
--
-- It FAILS if any calendar season is stored: the restored CHECKs reject "YYYY". Once a calendar
-- sport (formula 1) has been imported, delete its rows first. Most tables follow players/clubs
-- through their ON DELETE CASCADE FKs:
--
--   DELETE FROM players WHERE sport IN (SELECT id FROM sports WHERE season_format = 'calendar');
--   DELETE FROM clubs   WHERE sport IN (SELECT id FROM sports WHERE season_format = 'calendar');
--
-- Deploy app code that no longer accepts calendar seasons BEFORE running this.

BEGIN;

ALTER TABLE memberships          DROP CONSTRAINT IF EXISTS memberships_season_format_fkey;
ALTER TABLE club_titles          DROP CONSTRAINT IF EXISTS club_titles_season_format_fkey;
ALTER TABLE club_season_prestige DROP CONSTRAINT IF EXISTS club_season_prestige_season_format_fkey;

ALTER TABLE memberships          DROP COLUMN IF EXISTS season_format;
ALTER TABLE club_titles          DROP COLUMN IF EXISTS season_format;
ALTER TABLE club_season_prestige DROP COLUMN IF EXISTS season_format;

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_season_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_season_check CHECK (season ~ '^\d{4}-\d{4}$');
ALTER TABLE club_titles DROP CONSTRAINT IF EXISTS club_titles_season_check;
ALTER TABLE club_titles ADD CONSTRAINT club_titles_season_check CHECK (season ~ '^\d{4}-\d{4}$');
ALTER TABLE club_season_prestige DROP CONSTRAINT IF EXISTS club_season_prestige_season_check;
ALTER TABLE club_season_prestige
  ADD CONSTRAINT club_season_prestige_season_check CHECK (season ~ '^\d{4}-\d{4}$');

ALTER TABLE sports DROP CONSTRAINT IF EXISTS sports_id_season_format_key;
ALTER TABLE sports DROP CONSTRAINT IF EXISTS sports_season_format_check;
ALTER TABLE sports DROP COLUMN IF EXISTS season_format;

COMMIT;

NOTIFY pgrst, 'reload schema';
