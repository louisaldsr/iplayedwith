-- Undoes 027_sports_table.sql, back to the 026 state.
--
-- Not destructive for data — `sports` only holds ids, and nothing else is dropped.
--
-- It FAILS if any row belongs to a sport outside ('rugby', 'football'): the restored CHECKs
-- reject them. Once basketball has been imported, delete its rows first. Most tables follow
-- players/clubs through their ON DELETE CASCADE FKs; the root tables do not:
--
--   DELETE FROM players               WHERE sport NOT IN ('rugby', 'football');
--   DELETE FROM clubs                 WHERE sport NOT IN ('rugby', 'football');
--   DELETE FROM prestige_competitions WHERE sport NOT IN ('rugby', 'football');
--   DELETE FROM nation_tiers          WHERE sport NOT IN ('rugby', 'football');
--
-- `fame_calibration` had no CHECK before 027, so a basketball row there can stay.
--
-- Deploy app code that no longer lists those sports BEFORE running this.

BEGIN;

ALTER TABLE players ADD CONSTRAINT players_sport_check CHECK (sport IN ('rugby', 'football'));
ALTER TABLE clubs   ADD CONSTRAINT clubs_sport_check   CHECK (sport IN ('rugby', 'football'));
ALTER TABLE memberships
  ADD CONSTRAINT memberships_sport_check CHECK (sport IN ('rugby', 'football'));
ALTER TABLE club_aliases
  ADD CONSTRAINT club_aliases_sport_check CHECK (sport IN ('rugby', 'football'));
ALTER TABLE prestige_competitions
  ADD CONSTRAINT prestige_competitions_sport_check CHECK (sport IN ('rugby', 'football'));
ALTER TABLE nation_tiers
  ADD CONSTRAINT nation_tiers_sport_check CHECK (sport IN ('rugby', 'football'));

ALTER TABLE players               DROP CONSTRAINT IF EXISTS players_sport_fkey;
ALTER TABLE clubs                 DROP CONSTRAINT IF EXISTS clubs_sport_fkey;
ALTER TABLE prestige_competitions DROP CONSTRAINT IF EXISTS prestige_competitions_sport_fkey;
ALTER TABLE nation_tiers          DROP CONSTRAINT IF EXISTS nation_tiers_sport_fkey;
ALTER TABLE fame_calibration      DROP CONSTRAINT IF EXISTS fame_calibration_sport_fkey;

DROP TABLE IF EXISTS sports;

COMMIT;

NOTIFY pgrst, 'reload schema';
