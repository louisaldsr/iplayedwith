-- Undoes 012_fame_score.sql, back to the 011 state.
--
-- Not destructive: `score` is entirely derived from `player_fame.details` and
-- `memberships.games`, both left untouched. Re-applying 012 and recomputing rebuilds it
-- identically.
--
-- Rows created by compute_fame_scores() for players no import reached stay, with an empty
-- `details` — harmless, and exactly what apply_fame_details would create.
--
-- Deploy code that does not call compute_fame_scores() first (the seedFame scripts and
-- fame:compute do).

BEGIN;

DROP FUNCTION IF EXISTS public.compute_fame_scores(text);
DROP TABLE IF EXISTS fame_calibration;

-- Back to "not computed yet". All three together, per player_fame_scored_check.
UPDATE player_fame SET score = NULL, revision = NULL, last_update_at = NULL WHERE score IS NOT NULL;

COMMIT;
