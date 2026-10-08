-- Turns the list of sports into data: a `sports` table, referenced by every table that carries
-- `sport` without reaching it through another foreign key.
--
-- ─── Why ──────────────────────────────────────────────────────────────────────
--
-- The sport space was guarded by six copies of the same hard-coded list:
--
--   players_sport_check                CHECK (sport IN ('rugby', 'football'))   — 002
--   clubs_sport_check                  CHECK (sport IN ('rugby', 'football'))   — 002
--   memberships_sport_check            CHECK (sport IN ('rugby', 'football'))   — 006
--   club_aliases_sport_check           CHECK (sport IN ('rugby', 'football'))   — 008
--   prestige_competitions_sport_check  CHECK (sport IN ('rugby', 'football'))   — 023
--   nation_tiers_sport_check           CHECK (sport IN ('rugby', 'football'))   — 025
--
-- (`player_fame_sport_check` from 010 was already dropped by 011, for the same reason.)
--
-- Adding a sport meant finding and rewriting every one of them. After this migration, adding a
-- sport is one row:
--
--   INSERT INTO sports (id) VALUES ('f1');
--
-- ─── Where the invariant now lives ────────────────────────────────────────────
--
-- The ROOT tables — those whose `sport` is not already reached through a composite foreign key —
-- reference `sports` directly:
--
--   players, clubs                                  — added here (replace the 002 CHECKs)
--   prestige_competitions, nation_tiers             — added here (replace the 023/025 CHECKs)
--   fame_calibration                                — added here (012 had nothing: "there is no
--                                                     sports table")
--
-- Every other table inherits the check through the composite FK it already has:
--
--   memberships, player_fame, daily_challenges     → players (id, sport)
--   memberships, club_aliases, club_titles,
--     club_season_prestige                          → clubs (id, sport)
--   daily_results                                   → daily_challenges (sport, day)
--
-- No ON UPDATE / ON DELETE action: a sport id is never renamed, and deleting a sport that still
-- has rows anywhere must fail rather than cascade through the whole dataset.
--
-- ─── Apply ────────────────────────────────────────────────────────────────────
--
-- Check the constraint names first. The DROPs below are `IF EXISTS`, so a name that drifted
-- would be skipped SILENTLY and leave a stale CHECK behind:
--
--   SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname LIKE '%sport_check';
--   -- expect exactly the six listed above
--
-- Apply as ONE transaction in the Supabase SQL editor. Re-runnable.
-- Rollback: 027_sports_table_rollback.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS sports (
  id text PRIMARY KEY
);

INSERT INTO sports (id) VALUES ('rugby'), ('football'), ('basketball')
ON CONFLICT (id) DO NOTHING;

-- Same posture as every other table: public reads, writes reserved to service_role.
ALTER TABLE sports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read sports" ON sports;
CREATE POLICY "public read sports" ON sports FOR SELECT USING (true);

GRANT SELECT ON sports TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON sports TO service_role;

-- The FKs go on BEFORE the CHECKs come off, so there is no instant inside this transaction where
-- a root table accepts any sport. Validating them also proves every existing row names a sport
-- seeded above — an unknown value aborts the migration here.
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_sport_fkey;
ALTER TABLE players ADD CONSTRAINT players_sport_fkey FOREIGN KEY (sport) REFERENCES sports (id);

ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_sport_fkey;
ALTER TABLE clubs ADD CONSTRAINT clubs_sport_fkey FOREIGN KEY (sport) REFERENCES sports (id);

ALTER TABLE prestige_competitions DROP CONSTRAINT IF EXISTS prestige_competitions_sport_fkey;
ALTER TABLE prestige_competitions
  ADD CONSTRAINT prestige_competitions_sport_fkey FOREIGN KEY (sport) REFERENCES sports (id);

ALTER TABLE nation_tiers DROP CONSTRAINT IF EXISTS nation_tiers_sport_fkey;
ALTER TABLE nation_tiers ADD CONSTRAINT nation_tiers_sport_fkey FOREIGN KEY (sport) REFERENCES sports (id);

ALTER TABLE fame_calibration DROP CONSTRAINT IF EXISTS fame_calibration_sport_fkey;
ALTER TABLE fame_calibration
  ADD CONSTRAINT fame_calibration_sport_fkey FOREIGN KEY (sport) REFERENCES sports (id);

ALTER TABLE players               DROP CONSTRAINT IF EXISTS players_sport_check;
ALTER TABLE clubs                 DROP CONSTRAINT IF EXISTS clubs_sport_check;
ALTER TABLE memberships           DROP CONSTRAINT IF EXISTS memberships_sport_check;
ALTER TABLE club_aliases          DROP CONSTRAINT IF EXISTS club_aliases_sport_check;
ALTER TABLE prestige_competitions DROP CONSTRAINT IF EXISTS prestige_competitions_sport_check;
ALTER TABLE nation_tiers          DROP CONSTRAINT IF EXISTS nation_tiers_sport_check;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- No hard-coded sport list is left anywhere:
--   SELECT conrelid::regclass, conname FROM pg_constraint WHERE conname LIKE '%sport_check';
--   -- -> 0 rows
--
-- The five new FKs exist:
--   SELECT conrelid::regclass, conname FROM pg_constraint WHERE conname LIKE '%sport_fkey'
--      AND confrelid = 'sports'::regclass;
--   -- -> players, clubs, prestige_competitions, nation_tiers, fame_calibration
--
-- The guard works — this must FAIL with a foreign-key violation, not insert:
--   INSERT INTO players (id, name, sport) VALUES ('fk-check', 'FK check', 'curling');
--
-- And a new sport now needs nothing but its row:
--   SELECT id FROM sports ORDER BY id;
--   -- -> basketball, football, rugby
