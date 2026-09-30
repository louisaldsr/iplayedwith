-- Undoes 015_daily_results.sql.
--
-- DESTRUCTIVE: every recorded result, and so every past ranking, is lost. Dump them first if
-- they matter:
--   SELECT * FROM daily_results ORDER BY sport, day, started_at;
--
-- Deploy a build that no longer calls `start_daily_result` / `record_daily_move` BEFORE running
-- this. The current one would only log the failures (recording never blocks a move), but every
-- daily result in between would be lost.

BEGIN;

DROP FUNCTION IF EXISTS public.daily_ranking(text, date);
DROP FUNCTION IF EXISTS public.record_daily_move(text, date, uuid, text, text, boolean, integer, integer);
DROP FUNCTION IF EXISTS public.start_daily_result(text, date, uuid);
DROP TABLE IF EXISTS daily_results;

COMMIT;
