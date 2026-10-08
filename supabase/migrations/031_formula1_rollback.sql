-- Undoes 031_formula1.sql.
--
-- The `sports` row can only go once no Formula 1 row is left anywhere: every root table refers to
-- it (027), the season tables through their season-format FKs (030). Most tables follow players
-- and clubs through their ON DELETE CASCADE FKs; the others name the sport directly:
--
--   DELETE FROM daily_results    WHERE sport = 'formula1';
--   DELETE FROM daily_challenges WHERE sport = 'formula1';
--   DELETE FROM players          WHERE sport = 'formula1';
--   DELETE FROM clubs            WHERE sport = 'formula1';
--   DELETE FROM nation_tiers     WHERE sport = 'formula1';
--
-- Deploy app code without 'formula1' in SPORTS BEFORE running this.

BEGIN;

DELETE FROM prestige_competitions WHERE sport = 'formula1';
DELETE FROM fame_calibration WHERE sport = 'formula1';
DELETE FROM sports WHERE id = 'formula1';

COMMIT;
