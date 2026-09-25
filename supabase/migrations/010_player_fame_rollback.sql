-- Undoes 010_player_fame.sql, back to the 008/009 state.
--
-- DESTRUCTIVE. `player_fame.details` is the only home of the imported fame signals, and
-- nothing else in the schema carries them. Dropping the table means rebuilding them from the
-- sources: re-parsing ~20k cached rugby profiles, and a pass over 1.9M football appearance
-- rows. Neither is in version control. Dump it first:
--
--   SELECT sport, player_id, details, score, revision, last_update_at FROM player_fame;
--
-- `score` itself is lost without regret — it is entirely derived from `details`, so restoring
-- the signals and re-running the formula reconstructs it identically.
--
-- Nothing to deploy beforehand: as of writing, no read path in the game touches this table.
-- If that is no longer true, deploy the code that does not read it first.

BEGIN;

-- The functions first: both reference `player_fame`, so dropping the table under them would
-- leave two functions that fail at their first call.
DROP FUNCTION IF EXISTS public.refresh_fame_seasons(text);
DROP FUNCTION IF EXISTS public.apply_fame_details(text, jsonb);

-- The index, the policy and the constraints all go with the table.
DROP TABLE IF EXISTS player_fame;

COMMIT;
