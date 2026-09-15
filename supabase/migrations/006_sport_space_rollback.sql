-- Reverses 006_sport_space.sql. Safe as long as 006's changes are the only ones applied
-- on top: it only drops what 006 added and restores the FKs 001_initial.sql created.
-- No pre-existing column is touched, so no data is lost.

BEGIN;

DROP TRIGGER IF EXISTS memberships_fill_sport_trg ON memberships;
DROP FUNCTION IF EXISTS memberships_fill_sport();

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_player_sport_fkey;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_club_sport_fkey;

ALTER TABLE memberships
  ADD CONSTRAINT memberships_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
  ADD CONSTRAINT memberships_club_id_fkey
    FOREIGN KEY (club_id) REFERENCES clubs (id) ON DELETE CASCADE;

-- Drops memberships_sport_check and both sport indexes along with the column.
ALTER TABLE memberships DROP COLUMN IF EXISTS sport;

ALTER TABLE players DROP CONSTRAINT IF EXISTS players_id_sport_key;
ALTER TABLE clubs   DROP CONSTRAINT IF EXISTS clubs_id_sport_key;

DROP INDEX IF EXISTS players_sport_name_trgm_idx;
DROP INDEX IF EXISTS clubs_sport_name_trgm_idx;

COMMIT;

-- If the audit's quarantine block ran, reinstate those rows afterwards:
--   INSERT INTO memberships (player_id, club_id, season, competition)
--   SELECT player_id, club_id, season, competition FROM memberships_sport_conflicts;
--   DROP TABLE memberships_sport_conflicts;
