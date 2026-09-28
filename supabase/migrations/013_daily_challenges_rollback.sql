-- Undoes 013_daily_challenges.sql.
--
-- DESTRUCTIVE: every daily challenge drawn so far is lost, and a pair cannot be redrawn
-- identically. Dump them first if they matter:
--   SELECT * FROM daily_challenges ORDER BY sport, day;
--
-- Deploy a build without `GET /api/:sport/daily` BEFORE running this — the current one calls
-- `generate_daily_challenge`, which disappears here.
--
-- The pg_cron extension is left in place: other jobs may use it. Only this migration's job goes.

BEGIN;

-- Unschedule first, so no run can fire between the drops.
SELECT cron.unschedule('ensure-daily-challenges')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ensure-daily-challenges');

DROP FUNCTION IF EXISTS public.ensure_daily_challenges(date);
DROP FUNCTION IF EXISTS public.generate_daily_challenge(text, date);
DROP FUNCTION IF EXISTS public.player_shortest_path(text, text, text);
DROP TABLE IF EXISTS daily_challenges;

COMMIT;
