-- Undoes 029_basketball_fame.sql.
--
-- Removing the calibration row stops `compute_fame_scores('basketball')` (it refuses to run
-- without one); stored basketball scores stay as they are. The competition rows can only go once
-- no basketball title references them (club_titles' FK to prestige_competitions):
--
--   DELETE FROM club_titles WHERE sport = 'basketball';

BEGIN;

DELETE FROM prestige_competitions WHERE sport = 'basketball';
DELETE FROM fame_calibration WHERE sport = 'basketball';

COMMIT;
