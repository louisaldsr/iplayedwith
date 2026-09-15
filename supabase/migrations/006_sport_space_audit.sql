-- Pre-flight for 006_sport_space.sql. READ-ONLY except for the optional quarantine
-- block at the bottom. Run every query here and record the numbers BEFORE migrating.
--
-- Why: 006 adds composite FKs (player_id, sport) and (club_id, sport). A membership
-- whose player and club disagree on sport cannot satisfy both, and would abort the
-- migration. The data *should* be clean — every write goes through upsertMemberships
-- or upsertMembershipsBulk, which both reject a sport mismatch — but 002_add_sport.sql
-- blanket-stamped every pre-existing row as 'rugby', so that is worth verifying rather
-- than trusting.

-- ── A. The blocking case ────────────────────────────────────────────────────────
-- Memberships whose player and club disagree on sport. Expected: 0 rows.
SELECT m.player_id, p.name AS player, p.sport AS player_sport,
       m.club_id,   c.name AS club,   c.sport AS club_sport,
       m.season
FROM memberships m
JOIN players p ON p.id = m.player_id
JOIN clubs   c ON c.id = m.club_id
WHERE p.sport IS DISTINCT FROM c.sport;

-- ── B. Baseline counts ──────────────────────────────────────────────────────────
-- Record these. After 006, `SELECT sport, count(*) FROM memberships GROUP BY sport`
-- must match exactly (minus anything quarantined below).
--
-- Measured 2026-09-15, before 006 was applied:
--                 memberships   players   clubs
--   rugby              36 298     7 823      82
--   football           41 424    11 455     176
--   TOTAL              77 722
--
-- 36 298 + 41 424 = 77 722, the full table — so every membership's club resolves and
-- (A) returned no rows. The backfill leaves no NULLs and the quarantine step is not
-- needed on this data.
SELECT c.sport, count(*) AS memberships
FROM memberships m JOIN clubs c ON c.id = m.club_id
GROUP BY c.sport ORDER BY c.sport;

SELECT sport, count(*) AS players FROM players GROUP BY sport ORDER BY sport;
SELECT sport, count(*) AS clubs   FROM clubs   GROUP BY sport ORDER BY sport;

-- ── C. Orphans ──────────────────────────────────────────────────────────────────
-- The existing single-column FKs should make these zero. Confirm before dropping them.
SELECT count(*) AS orphan_player_refs
FROM memberships m LEFT JOIN players p ON p.id = m.player_id WHERE p.id IS NULL;

SELECT count(*) AS orphan_club_refs
FROM memberships m LEFT JOIN clubs c ON c.id = m.club_id WHERE c.id IS NULL;

-- ── D. Actual constraint names ──────────────────────────────────────────────────
-- 006 drops `memberships_player_id_fkey` / `memberships_club_id_fkey`. 001_initial.sql
-- let Postgres generate them, so confirm these are the real names and edit 006 if not.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'memberships'::regclass ORDER BY conname;


-- ════════════════════════════════════════════════════════════════════════════════
-- QUARANTINE — run ONLY if (A) returned rows.
--
-- These rows are genuinely ambiguous: nothing in the data says whether the player or
-- the club carries the wrong sport. So they are set aside for manual triage rather
-- than guessed at by the migration. Nothing is lost — fix the offending player's or
-- club's sport by hand, then reinstate from the conflicts table.
-- ════════════════════════════════════════════════════════════════════════════════

-- BEGIN;
--
-- CREATE TABLE memberships_sport_conflicts AS
-- SELECT m.* FROM memberships m
-- JOIN players p ON p.id = m.player_id
-- JOIN clubs   c ON c.id = m.club_id
-- WHERE p.sport IS DISTINCT FROM c.sport;
--
-- DELETE FROM memberships m
-- USING players p, clubs c
-- WHERE p.id = m.player_id AND c.id = m.club_id AND p.sport IS DISTINCT FROM c.sport;
--
-- COMMIT;

-- To reinstate after fixing the underlying player/club sports (the new FKs will reject
-- anything still inconsistent, which is the point):
--   INSERT INTO memberships (player_id, club_id, season, competition)
--   SELECT player_id, club_id, season, competition FROM memberships_sport_conflicts;
--   DROP TABLE memberships_sport_conflicts;
