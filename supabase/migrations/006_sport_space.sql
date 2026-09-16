-- Makes `sport` a first-class space: every table carries it, indexed, with the
-- cross-sport invariant enforced by Postgres rather than by application code.
--
-- Before this, `memberships` had no `sport` column, so scoping a sport's memberships
-- meant joining `clubs` — which made the game's data load a deep-OFFSET paged join.
--
-- RUN THE AUDIT IN 006_sport_space_audit.sql FIRST. A membership whose player and club
-- disagree on sport will abort this migration at FK-validation time; the audit finds
-- those rows and the quarantine step moves them aside.
--
-- Apply as ONE transaction in the Supabase SQL editor (there is no migration runner
-- in this repo). Check the generated FK names first — 001_initial.sql let Postgres
-- name them:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'memberships'::regclass;

BEGIN;

-- Composite FK targets. Redundant against the PK, but a FK must reference a unique
-- constraint covering exactly the columns it points at.
ALTER TABLE players ADD CONSTRAINT players_id_sport_key UNIQUE (id, sport);
ALTER TABLE clubs   ADD CONSTRAINT clubs_id_sport_key   UNIQUE (id, sport);

-- Backfill from clubs, matching what `listBySport` already means by "a sport's
-- memberships" (it scopes via clubs.sport today). The audit guarantees the player agrees.
ALTER TABLE memberships ADD COLUMN sport TEXT;
UPDATE memberships m SET sport = c.sport FROM clubs c WHERE c.id = m.club_id;

-- Safe abort point: the transaction is still open, so a failure here rolls back cleanly.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM memberships WHERE sport IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % membership rows still have NULL sport', n;
  END IF;
END $$;

ALTER TABLE memberships ALTER COLUMN sport SET NOT NULL;
ALTER TABLE memberships ADD CONSTRAINT memberships_sport_check
  CHECK (sport IN ('rugby', 'football'));

-- Replace the single-column FKs with sport-aware ones. ON UPDATE CASCADE so moving a
-- club between sports rewrites its memberships; if that leaves the player disagreeing,
-- the other FK rejects it — which is exactly the invariant we want.
ALTER TABLE memberships DROP CONSTRAINT memberships_player_id_fkey;
ALTER TABLE memberships DROP CONSTRAINT memberships_club_id_fkey;
ALTER TABLE memberships
  ADD CONSTRAINT memberships_player_sport_fkey
    FOREIGN KEY (player_id, sport) REFERENCES players (id, sport)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT memberships_club_sport_fkey
    FOREIGN KEY (club_id, sport) REFERENCES clubs (id, sport)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Lets this migration ship AHEAD of the application code: currently-deployed code still
-- inserts without `sport`, and this fills it in from the club. Drop it via
-- 007_drop_sport_backfill_trigger.sql once the new repository code is live.
CREATE FUNCTION memberships_fill_sport() RETURNS trigger AS $$
BEGIN
  IF NEW.sport IS NULL THEN
    SELECT sport INTO NEW.sport FROM clubs WHERE id = NEW.club_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER memberships_fill_sport_trg
  BEFORE INSERT OR UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION memberships_fill_sport();

-- The index the move endpoint lives on: one lookup of "memberships for these ~15 players
-- in this sport" replaces paging the whole sport-scoped table.
-- Created after the backfill, not before. Plain CREATE INDEX (not CONCURRENTLY) so it can
-- live inside this transaction; at ~100k rows the write lock is a second or two.
CREATE INDEX memberships_sport_player_idx      ON memberships (sport, player_id);
CREATE INDEX memberships_sport_club_season_idx ON memberships (sport, club_id, season);

-- Typeahead: `.ilike('%q%')` is an unindexable sequential scan over ~11k rows today.
-- btree_gin lets the `sport` equality filter sit in the same GIN index as the trigrams.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE INDEX players_sport_name_trgm_idx ON players USING gin (sport, name gin_trgm_ops);
CREATE INDEX clubs_sport_name_trgm_idx   ON clubs   USING gin (sport, name gin_trgm_ops);

COMMIT;
