-- players
CREATE TABLE players (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- clubs
CREATE TABLE clubs (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- memberships — composite PK prevents duplicates
CREATE TABLE memberships (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  club_id   TEXT NOT NULL REFERENCES clubs(id)   ON DELETE CASCADE,
  season    TEXT NOT NULL CHECK (season ~ '^\d{4}-\d{4}$'),
  PRIMARY KEY (player_id, club_id, season)
);

CREATE INDEX ON memberships (player_id);
CREATE INDEX ON memberships (club_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE players    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Public (anon) can only read
CREATE POLICY "public read players"     ON players     FOR SELECT USING (true);
CREATE POLICY "public read clubs"       ON clubs       FOR SELECT USING (true);
CREATE POLICY "public read memberships" ON memberships FOR SELECT USING (true);

-- Only the service_role key (admin) can write — service_role bypasses RLS by default,
-- so no extra policy needed. The policies above cover the anon/authenticated roles.

-- ─── Grants ────────────────────────────────────────────────────────────────
-- RLS bypass alone isn't enough — service_role still needs base table privileges.
GRANT SELECT ON players, clubs, memberships TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON players, clubs, memberships TO service_role;
