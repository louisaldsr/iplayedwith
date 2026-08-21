-- Adds the sport column to players and clubs so the data layer can be
-- scoped to a specific sport (rugby, football, ...).

ALTER TABLE players ADD COLUMN sport TEXT;
ALTER TABLE clubs   ADD COLUMN sport TEXT;

-- All existing data predates the multi-sport feature and is rugby-only.
UPDATE players SET sport = 'rugby' WHERE sport IS NULL;
UPDATE clubs   SET sport = 'rugby' WHERE sport IS NULL;

ALTER TABLE players ALTER COLUMN sport SET NOT NULL;
ALTER TABLE clubs   ALTER COLUMN sport SET NOT NULL;

ALTER TABLE players ADD CONSTRAINT players_sport_check CHECK (sport IN ('rugby', 'football'));
ALTER TABLE clubs   ADD CONSTRAINT clubs_sport_check   CHECK (sport IN ('rugby', 'football'));

CREATE INDEX ON players (sport);
CREATE INDEX ON clubs (sport);
