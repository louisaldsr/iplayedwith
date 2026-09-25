-- Gives every player a fame score: "how likely is the user to have heard of this player".
--
-- Before this, nothing expressed a player's standing, and `findRandom`
-- (src/repositories/playersRepository.ts) drew uniformly across the whole table — so a game
-- could pit two unknowns against each other out of 7,823 rugby or 11,455 football players.
--
-- Three upcoming uses depend on it: drawing the random pair from a fame band, building the
-- daily challenge, and scoring points (a less-known player is worth more).
--
-- ─── What this table holds ────────────────────────────────────────────────────
--
-- Both halves of the metric, on one row per player:
--
--   details  — the INPUTS  (caps, games, ... ) written by the import scripts
--   score    — the OUTPUT, derived from `details` by the fame formula
--
-- One table rather than two because the relation is strictly 1:1, the data is refreshed once
-- or twice a year (end of season, optionally mid-season), and a recompute then reads nothing
-- but its own row — no join, no re-aggregation:
--
--   UPDATE player_fame SET score = ..., revision = 2 WHERE sport = 'rugby';
--
-- ─── Why NOT columns on `players`, and NOT a generated column ─────────────────
--
-- A first version stored `fame` as a GENERATED column on `players`, recomputed by Postgres
-- whenever `fame_details` was written. Two reasons it was dropped:
--
-- 1. A generated column cannot read another table — a hard constraint, not a preference. Any
--    signal that lives outside the player row (games aggregated from `memberships`, a club
--    standing, a national-team tier) would have to be denormalised onto `players` first, by a
--    refresh step. The generated column's one promise, "nothing left to forget", dies the
--    moment an input is a join, and its cost stays.
--
-- 2. Changing the formula was a five-step ritual: DROP COLUMN, replace the function, ADD
--    COLUMN, restate the CHECK, rebuild the index. Postgres does NOT refuse a plain
--    `CREATE OR REPLACE` on a function a generated column depends on — it accepts it silently,
--    leaves stored values alone, and applies the new formula only to rows rewritten afterwards.
--    The table drifts into a MIXED state with nothing to flag it (measured on a local database:
--    stored fame = 93 while the function returned 0). `revision` below is what replaces
--    that missing guardrail.
--
-- Keeping it off `players` also means the import that writes a player's identity and the one
-- that writes their signals can never overwrite each other.
--
-- ─── Scope of THIS migration ──────────────────────────────────────────────────
--
-- The table, and the two functions that WRITE ITS INPUTS. It is created EMPTY, and `score`
-- stays NULL on every row until the fame formula exists: the import scripts fill `details`
-- first, and the score is derived from it in a later migration.
--
-- Depends on 006_sport_space.sql (players_id_sport_key).
--
-- Apply as ONE transaction in the Supabase SQL editor (there is no migration runner in this
-- repo). Rollback: 010_player_fame_rollback.sql — DESTRUCTIVE, read its header first.

BEGIN;

-- The composite FK on (player_id, sport) leans on `players_id_sport_key` from 006, so this
-- table inherits the sport-space invariant instead of restating it — same as `club_aliases`
-- in 008.
CREATE TABLE player_fame (
  sport           text NOT NULL,
  player_id       text NOT NULL,

  -- The INPUTS, as an open bag: {"caps": 99, "games": 250, ...}. Open because the set of
  -- signals is still moving — adding one costs no migration. Written with a `||` merge so a
  -- script that knows about one key cannot erase a key another script wrote.
  --
  -- This is the only home of these numbers. They come from a scrape (rugby: ~20k cached
  -- profiles) or a bulk pass (football: 1.9M appearance rows), and nothing else in the schema
  -- carries them — which is why this table is never TRUNCATEd and why the rollback is
  -- destructive.
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The OUTPUT. NULL means "not computed yet", which is the state of every row the import
  -- creates: `details` arrives first, the score follows. So it cannot be NOT NULL.
  --
  -- 0..100 and rounded to an integer on purpose. The weights behind it are declared priors,
  -- not fitted to anything, so decimals would claim a precision that does not exist. It is NOT
  -- a percentage and is never shown to a user: the game reads score FLOORS (categories), so
  -- that players close together weigh the same.
  score           integer,

  -- Two DIFFERENT staleness questions, and neither covers the other:
  --   last_update_at → the inputs moved since (a reimport rewrote `details`)
  --   revision       → the formula moved since (someone changed how score is derived)
  -- Changing the formula means editing SQL, which leaves no trace in the data — so there is no
  -- timestamp to compare against, and only the revision catches it. Bumped by hand in the
  -- UPDATE that computes the score; `fame:report` flags every row left on an older one.
  -- Both NULL while `score` is NULL, and set together with it.
  revision        smallint,
  last_update_at  timestamptz,

  PRIMARY KEY (sport, player_id),

  CONSTRAINT player_fame_score_range_check    CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  CONSTRAINT player_fame_sport_check          CHECK (sport IN ('rugby', 'football')),
  -- Set together or not at all: a score with no revision cannot be checked for staleness,
  -- which defeats the column's purpose.
  CONSTRAINT player_fame_scored_check
    CHECK ((score IS NULL) = (revision IS NULL)
       AND (score IS NULL) = (last_update_at IS NULL)),
  -- The bag is written by scripts, so it is worth stating that it IS a bag: without this a
  -- stray `'12'::jsonb` or `'null'::jsonb` stores fine and every later `->>` returns NULL.
  CONSTRAINT player_fame_details_object_check CHECK (jsonb_typeof(details) = 'object'),

  CONSTRAINT player_fame_player_sport_fkey
    FOREIGN KEY (player_id, sport) REFERENCES players (id, sport)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- The band draw — "a well-known rugby player" — is the hot read this table exists for:
--   WHERE sport = ? AND score BETWEEN ? AND ?
-- `sport` leads because every read is already filtered by it and it carves the index into two
-- contiguous ranges. This is also why `sport` is carried on the row rather than reached through
-- `players`: without it here, this index cannot exist and every band draw would join to filter.
CREATE INDEX player_fame_sport_score_idx ON player_fame (sport, score);

-- Same posture as every other table since 001: public reads, writes reserved to service_role
-- (which bypasses RLS, but still needs the base privileges).
ALTER TABLE player_fame ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read player_fame" ON player_fame FOR SELECT USING (true);

GRANT SELECT ON player_fame TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON player_fame TO service_role;

-- ─── Writing the signals ──────────────────────────────────────────────────────

-- Called by the import scripts through supabase.rpc(), in batches of 1000.
--
-- An RPC rather than a PostgREST `upsert`: PostgREST has no bulk update, so the alternatives
-- are one request per player (tens of thousands) or an upsert that restates every column —
-- and an upsert would let a stale import overwrite values it knows nothing about.
--
-- The merge is `||`, not assignment: keys this caller has never heard of (a signal written by
-- another script, or `seasons` below) survive its write.
--
-- INSERT ... ON CONFLICT rather than UPDATE, because the row may not exist yet — this is what
-- creates it. `score` is left NULL: the signals arrive first, the score is computed later.
--
-- The EXISTS guard keeps an unknown player_id from aborting the whole batch on the foreign
-- key. It is skipped silently and shows up as a gap between the row count sent and the count
-- returned, which is what the caller reports.
--
-- `p_rows`: [{"player_id": "...", "details": {"gamesPlayed": 250, "caps": 99}}, ...]
CREATE FUNCTION public.apply_fame_details(p_sport text, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  written integer;
BEGIN
  -- DISTINCT ON, because ON CONFLICT refuses to touch the same row twice in one statement
  -- ("cannot affect row a second time"). A batch carrying a player twice — the rugby import
  -- merges two sources — would otherwise fail the whole call. Last entry wins.
  --
  -- jsonb_array_elements rather than jsonb_to_recordset: "last wins" needs the position of each
  -- entry, and Postgres refuses WITH ORDINALITY next to a column definition list.
  WITH input AS (
    SELECT DISTINCT ON (e.elem ->> 'player_id')
           e.elem ->> 'player_id'                   AS player_id,
           coalesce(e.elem -> 'details', '{}'::jsonb) AS details
      FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(elem, ord)
     ORDER BY e.elem ->> 'player_id', e.ord DESC
  )
  INSERT INTO player_fame (sport, player_id, details)
  SELECT p_sport, i.player_id, i.details
    FROM input i
   WHERE EXISTS (SELECT 1 FROM players p WHERE p.id = i.player_id AND p.sport = p_sport)
      ON CONFLICT (sport, player_id) DO UPDATE
     SET details = player_fame.details || EXCLUDED.details;

  GET DIAGNOSTICS written = ROW_COUNT;
  RETURN written;
END;
$$;

-- `seasons` is derived from `memberships`, never written by an import: it is exactly the data
-- the game builds its graph from, so it cannot diverge, and this refresh picks up a membership
-- change without re-running a scraper.
--
-- An explicit step rather than a trigger on `memberships`: an import writes 41,424 rows, and
-- this repo has already removed precisely that kind of trigger for that reason (migration 007).
-- A maintained counter would also drift silently the first time a write bypassed it, whereas a
-- recount is correct by construction.
--
-- UPDATE, not upsert: a player with no signals row gets none here. `seasons` on its own says
-- nothing about fame — it is only ever the divisor of `gamesPlayed / seasons`.
--
-- The LEFT JOIN matters: a player whose memberships all disappeared must be written back to 0,
-- not left holding a stale count from an earlier run.
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

-- Both of these WRITE. Unlike search_players/search_clubs in 008 they are not open to anon:
-- only the import (service_role) calls them.
GRANT EXECUTE ON FUNCTION public.apply_fame_details(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_fame_seasons(text)      TO service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- The table is created empty and nothing writes to it yet, so the checks are structural.
--
-- SELECT count(*) FROM player_fame;   -- -> 0, expected
--
-- The sport-space invariant is inherited, not restated — prove it is actually enforced by
-- trying to break it. All three must FAIL:
--   INSERT INTO player_fame (sport, player_id)
--     SELECT 'football', id FROM players WHERE sport = 'rugby' LIMIT 1;
--     -- -> violates player_fame_player_sport_fkey
--   INSERT INTO player_fame (sport, player_id, score, revision, last_update_at)
--     SELECT sport, id, 101, 1, now() FROM players LIMIT 1;
--     -- -> violates player_fame_score_range_check
--   INSERT INTO player_fame (sport, player_id, score)
--     SELECT sport, id, 50 FROM players LIMIT 1;
--     -- -> violates player_fame_scored_check (score without revision)
--
-- And that an empty row is legal, because that is what the caps import creates:
--   INSERT INTO player_fame (sport, player_id, details)
--     SELECT sport, id, '{"caps": 99}'::jsonb FROM players LIMIT 1;   -- -> OK
--   ROLLBACK;  -- or DELETE it
--
-- Coverage, the two queries this table is shaped for:
--   SELECT p.sport, count(*) AS no_signals
--     FROM players p LEFT JOIN player_fame f ON f.player_id = p.id AND f.sport = p.sport
--    WHERE f.player_id IS NULL GROUP BY p.sport;
--   SELECT sport, count(*) AS not_scored FROM player_fame WHERE score IS NULL GROUP BY sport;
--
-- ─── Changing the formula later ───────────────────────────────────────────────
--
-- No ritual and no mixed state — the inputs are on the row, so a recompute is one statement
-- that touches only the derived columns:
--
--   UPDATE player_fame
--      SET score = <new formula over `details`>, revision = 2, last_update_at = now()
--    WHERE sport = 'rugby';
--
-- `details` is NOT touched. Never TRUNCATE this table: it is the only home of the imported
-- signals, and rebuilding them means a full rescrape.
--
-- Leaving rows behind is not silent: they keep the old `revision`, and fame:report
-- fails on any row whose version is not the current one.
