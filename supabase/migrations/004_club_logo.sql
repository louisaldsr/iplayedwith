-- Drops the flat, non-season-scoped clubs.competition column (002_club_competition.sql).
-- Competition tracking is deferred as a future enhancement; for now it isn't modeled
-- at the club level at all.
ALTER TABLE clubs DROP COLUMN competition;
ALTER TABLE clubs ADD COLUMN logo_url TEXT;
