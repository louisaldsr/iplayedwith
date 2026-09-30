-- Undoes 023_season_prestige.sql (and 024, whose rows live in club_titles).
--
-- Roll 025_fame_stage.sql back FIRST: its compute_fame_scores reads club_season_prestige and
-- calls compute_season_prestige, and would fail on every run once they are gone.
--
-- DESTRUCTIVE for the imported inputs: `club_season_prestige.details` (the continental runs)
-- and the derived football titles are only rebuilt by re-running the prestige imports
-- (npm run seed:prestige, npm run seed:football:prestige). The rugby titles come back by
-- re-applying 024. Scores are derived and cost nothing.

BEGIN;

DROP FUNCTION IF EXISTS public.compute_season_prestige(text);
DROP FUNCTION IF EXISTS public.replace_club_titles(text, text, jsonb);
DROP FUNCTION IF EXISTS public.replace_continental_wins(text, jsonb);

DROP TABLE IF EXISTS club_season_prestige;
DROP TABLE IF EXISTS club_titles;
DROP TABLE IF EXISTS prestige_competitions;

ALTER TABLE fame_calibration DROP CONSTRAINT IF EXISTS fame_calibration_k_continental_positive_check;
ALTER TABLE fame_calibration DROP COLUMN IF EXISTS k_continental;

COMMIT;
