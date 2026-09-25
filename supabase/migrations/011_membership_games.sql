-- Moves the games-played signal onto `memberships`, where it can only ever describe a club and a
-- season that exist in the database.
--
-- ─── Why ──────────────────────────────────────────────────────────────────────
--
-- 010 stored two derived numbers in `player_fame.details`:
--
--   gamesPlayed — a career total, written by the import scripts
--   seasons     — a count of distinct seasons, derived from `memberships`
--
-- Both are aggregates of what `memberships` already describes, and keeping them apart let the
-- two drift into different scopes. An import could count games at clubs that never became
-- memberships, while `seasons` only counted the memberships. Dividing one by the other then
-- produced impossible ratios — measured after the first import: 113 players above 50 games per
-- season, the worst at 110 games in a single season.
--
-- With `games` on the membership row, every aggregate the score needs is computed from ONE
-- table, so the numerator and the denominator always cover the same clubs and seasons:
--
--   total games  = sum(games)
--   seasons      = count(DISTINCT season)
--   intensity    = sum(games) / count(DISTINCT season)
--
-- Nothing is stored twice, so nothing has to be refreshed. `refresh_fame_seasons()` goes.
--
-- ─── The contract every import must fill ──────────────────────────────────────
--
--   memberships.games = matches the player played FOR THAT CLUB, IN THAT SEASON,
--                       all competitions combined.
--
--   NULL — the source does not say. Not the same as 0.
--   0    — the player was in the squad and played no match.
--
-- How a given source is read to produce that number is the import script's business, and only
-- the import script's. Everything downstream is sport-agnostic.
--
-- ─── Also in this migration ───────────────────────────────────────────────────
--
-- `player_fame_sport_check` is dropped. It hard-coded the list of sports, and it was redundant:
-- the composite foreign key to `players (id, sport)` already guarantees the sport is valid.
--
-- The `gamesPlayed` and `seasons` keys already written into `player_fame.details` are removed,
-- so nothing can read them by mistake. `details` now holds only signals `memberships` cannot
-- provide — today, `caps`.
--
-- Depends on 010_player_fame.sql.
--
-- Apply as ONE transaction in the Supabase SQL editor. Rollback: 011_membership_games_rollback.sql.
--
-- ORDER: deploy the updated import scripts before re-running any fame import. The previous
-- scripts still write `gamesPlayed` into `details` and call `refresh_fame_seasons()`, which no
-- longer exists after this migration.

BEGIN;

-- Nullable: every existing row is NULL until its import runs again, which is exactly what
-- NULL means here ("the source has not said").
ALTER TABLE memberships ADD COLUMN games integer;

ALTER TABLE memberships
  ADD CONSTRAINT memberships_games_check CHECK (games IS NULL OR games >= 0);

DROP FUNCTION public.refresh_fame_seasons(text);

ALTER TABLE player_fame DROP CONSTRAINT player_fame_sport_check;

-- `-` on jsonb removes a key and is a no-op when the key is absent, so this is safe to run on
-- rows that never had them.
UPDATE player_fame
   SET details = details - 'gamesPlayed' - 'seasons'
 WHERE details ?| ARRAY['gamesPlayed', 'seasons'];

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- Right after applying — the column exists and is empty:
--   SELECT count(*) FILTER (WHERE games IS NOT NULL) FROM memberships;          -- -> 0
--   SELECT to_regproc('public.refresh_fame_seasons');                            -- -> NULL
--   SELECT count(*) FROM player_fame WHERE details ?| ARRAY['gamesPlayed','seasons'];  -- -> 0
--
-- After the imports have run again — coverage and plausibility, per sport, one query for all:
--   SELECT sport,
--          count(*)                                    AS memberships,
--          count(games)                                AS with_games,
--          max(games)                                  AS max_per_club_season,
--          percentile_cont(0.99) WITHIN GROUP (ORDER BY games) AS p99
--     FROM memberships
--    GROUP BY sport;
--
-- The plausibility check that caught the original bug, now computed from one table:
--   SELECT sport, player_id,
--          sum(games) AS games,
--          count(DISTINCT season) AS seasons,
--          round(sum(games)::numeric / count(DISTINCT season), 1) AS per_season
--     FROM memberships
--    WHERE games IS NOT NULL
--    GROUP BY sport, player_id
--    ORDER BY per_season DESC
--    LIMIT 20;
--   -- A value far above what one season can hold means an import broke the contract above.
