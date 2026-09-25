-- Undoes 011_membership_games.sql, back to the 010 state.
--
-- DESTRUCTIVE for one thing: `memberships.games`. Rebuilding it means re-running every import.
-- Dump it first if that matters:
--   SELECT sport, player_id, club_id, season, games FROM memberships WHERE games IS NOT NULL;
--
-- NOT restored: the `gamesPlayed` and `seasons` keys 011 removed from `player_fame.details`.
-- After this rollback, re-run the previous fame import scripts to write them back.
--
-- Deploy the previous import scripts BEFORE running this — the current ones write
-- `memberships.games`, which disappears here.

BEGIN;

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_games_check;
ALTER TABLE memberships DROP COLUMN IF EXISTS games;

ALTER TABLE player_fame
  ADD CONSTRAINT player_fame_sport_check CHECK (sport IN ('rugby', 'football'));

CREATE FUNCTION public.refresh_fame_seasons(p_sport text)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE player_fame f
     SET details = f.details || jsonb_build_object('seasons', s.season_count)
    FROM (
      SELECT p.id, count(DISTINCT m.season) AS season_count
        FROM players p
        LEFT JOIN memberships m ON m.player_id = p.id AND m.sport = p.sport
       WHERE p.sport = p_sport
       GROUP BY p.id
    ) s
   WHERE f.player_id = s.id
     AND f.sport = p_sport;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_fame_seasons(text) TO service_role;

COMMIT;
