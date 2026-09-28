-- The daily challenge: every day, per sport, one pair of players everyone plays.
--
-- ─── What is stored ───────────────────────────────────────────────────────────
--
-- One row per (sport, day). The pair is drawn once and then frozen: a ranking per day only
-- makes sense if everyone plays the same pair, and a pair recomputed from a seed would move
-- the moment an import changed the roster it was drawn from.
--
--   number        — the challenge's number within its sport, Wordle-style: the sport's launch
--                   day is #1, the next day #2, and so on. It follows the calendar, not the
--                   draws — see "Numbering" below.
--   optimal_links — length of the shortest chain between A and B, in links (A—X—B = 2).
--                   The "par" a future ranking will compare each result against.
--   solution      — one shortest chain, player ids from A to B. Never sent to a browser while
--                   the day is running; the API reads the pair, not this.
--
-- ─── How the pair is drawn ────────────────────────────────────────────────────
--
-- Uniformly among the players of the sport that have at least one membership — a player with
-- none can never be connected, so drawing them would only waste attempts. A pair is kept when:
--
--   · a chain exists at all (the two players are in the same component of the graph), and
--   · it takes at least 2 links. At 1 link the pair already played together, and easy mode —
--     the daily's only mode — resolves that link by itself: the puzzle would be solved before
--     it began. Same rule as the setup screen's guard (`POST /api/validate`).
--
-- Otherwise the draw is repeated, up to 20 times. There is no upper bound on the distance:
-- club rosters overlap heavily, so random pairs land at a few links.
--
-- ─── When it is drawn ─────────────────────────────────────────────────────────
--
-- Every day, visitors or not. A pg_cron job runs `ensure_daily_challenges` every hour: it draws
-- today's AND tomorrow's pair for every sport, and any day missed since the sport's launch. So
-- the next challenge exists before midnight, and a day the job was down is caught up on the
-- next run.
--
-- Hourly rather than at midnight: pg_cron schedules in UTC, and Paris midnight is 22:00 or
-- 23:00 UTC depending on daylight saving. An hourly run is right in both, and costs nothing —
-- every existing day is skipped.
--
-- The API keeps a lazy fallback: `GET /api/:sport/daily` calls `generate_daily_challenge` for
-- today, which only draws if the job has not. Both paths take the same per-sport advisory lock,
-- so they can never draw two pairs for one day.
--
-- The day is Europe/Paris on both sides. The server computes it for the API
-- (src/domain/dailyChallenge.ts, CHALLENGE_TIME_ZONE); the cron job computes it in SQL. The
-- zone is written twice, once per side — change both together.
--
-- ─── Numbering ────────────────────────────────────────────────────────────────
--
--   number = day − launch day + 1
--
-- The launch day of a sport is the day of its FIRST challenge — the first day the job (or a
-- request) drew for it. Nothing to configure, and nothing branches on the sport: a sport added
-- later starts at its own #1.
--
-- Because the number is the date, it never depends on who visited or when the pair was drawn:
-- a day caught up late gets the number it would have had on time.
--
-- Consequence: the first draw FIXES #1. Drawing a test day on the production database before
-- launch moves the whole series — to relaunch, empty the table (see the rollback's dump first).
-- A day before the launch day is refused.
--
-- Depends on 006_sport_space.sql (players_id_sport_key, the memberships indexes).
--
-- Apply as ONE transaction in the Supabase SQL editor. Rollback: 013_daily_challenges_rollback.sql.

BEGIN;

CREATE TABLE daily_challenges (
  sport          text        NOT NULL,
  day            date        NOT NULL,
  number         integer     NOT NULL,
  player_a_id    text        NOT NULL,
  player_b_id    text        NOT NULL,
  optimal_links  integer     NOT NULL,
  solution       text[]      NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (sport, day),
  CONSTRAINT daily_challenges_sport_number_key UNIQUE (sport, number),

  -- Composite FKs on (id, sport), like `player_fame`: the pair inherits the sport-space
  -- invariant instead of restating it.
  CONSTRAINT daily_challenges_player_a_fkey FOREIGN KEY (player_a_id, sport) REFERENCES players (id, sport),
  CONSTRAINT daily_challenges_player_b_fkey FOREIGN KEY (player_b_id, sport) REFERENCES players (id, sport),

  CONSTRAINT daily_challenges_distinct_players_check CHECK (player_a_id <> player_b_id),
  CONSTRAINT daily_challenges_number_check          CHECK (number >= 1),
  CONSTRAINT daily_challenges_optimal_links_check    CHECK (optimal_links >= 2),
  -- A chain of N links holds N + 1 players, from A to B.
  CONSTRAINT daily_challenges_solution_check
    CHECK (array_length(solution, 1) = optimal_links + 1
       AND solution[1] = player_a_id
       AND solution[array_length(solution, 1)] = player_b_id)
);

-- RLS on and NO policy: anon and authenticated read nothing, `solution` included. Only the
-- server reads and writes, with the service_role key (which bypasses RLS but still needs the
-- base privileges). The explicit REVOKE undoes Supabase's default grants on new tables.
ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON daily_challenges FROM anon, authenticated;
GRANT SELECT, INSERT ON daily_challenges TO service_role;

-- ─── Shortest chain between two players ───────────────────────────────────────

-- Breadth-first search over the player graph: two players are neighbours when they share a
-- (club, season). Same graph as `bfsPlayerPath` (src/game/path.ts), which the game uses to
-- detect victory — here over the whole sport instead of the few nodes of one game.
--
-- The graph is walked as what it is, bipartite: player → (club, season) → player. Each
-- club-season is expanded ONCE, when first reached — a roster of 40 reached from 40 of its own
-- players is read once, not 40 times. So the whole search reads each membership at most twice,
-- through `memberships_sport_player_idx` and `memberships_sport_club_season_idx`, whatever the
-- distance. That bound matters most when the pair is NOT connected: the search then exhausts
-- A's whole component before giving up.
--
-- `bfs_players` holds each reached player with the club-season it was reached through, and
-- `bfs_club_seasons` each expanded club-season with the player it was reached from; the chain
-- is read back from B by alternating the two. ON COMMIT DROP, so nothing outlives the calling
-- transaction — and TRUNCATE, because `generate_daily_challenge` calls this several times in one.
--
-- Returns the chain from p_from to p_to, both included, or NULL when they are not connected.
CREATE FUNCTION public.player_shortest_path(p_sport text, p_from text, p_to text)
RETURNS text[]
LANGUAGE plpgsql AS $$
DECLARE
  v_depth integer := 0;
  v_added integer;
  v_current text;
  v_club_id text;
  v_season text;
  v_path text[];
BEGIN
  IF p_from = p_to THEN
    RETURN ARRAY[p_from];
  END IF;

  -- to_regclass rather than CREATE ... IF NOT EXISTS, which raises a NOTICE on every reuse.
  IF to_regclass('pg_temp.bfs_players') IS NULL THEN
    CREATE TEMP TABLE bfs_players (
      player_id text PRIMARY KEY,
      via_club  text,
      via_season text,
      depth     integer NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE bfs_club_seasons (
      club_id   text NOT NULL,
      season    text NOT NULL,
      via_player text NOT NULL,
      depth     integer NOT NULL,
      PRIMARY KEY (club_id, season)
    ) ON COMMIT DROP;
  ELSE
    TRUNCATE bfs_players, bfs_club_seasons;
  END IF;

  INSERT INTO bfs_players VALUES (p_from, NULL, NULL, 0);

  LOOP
    -- The club-seasons of the frontier players not expanded yet. DISTINCT ON keeps one
    -- predecessor each — the smallest id, so the chain is deterministic for a given dataset.
    INSERT INTO bfs_club_seasons (club_id, season, via_player, depth)
    SELECT DISTINCT ON (m.club_id, m.season) m.club_id, m.season, p.player_id, v_depth
      FROM bfs_players p
      JOIN memberships m ON m.sport = p_sport AND m.player_id = p.player_id
     WHERE p.depth = v_depth
       AND NOT EXISTS (SELECT 1 FROM bfs_club_seasons c WHERE c.club_id = m.club_id AND c.season = m.season)
     ORDER BY m.club_id, m.season, p.player_id;

    -- Their rosters: every player not reached yet is one link further.
    INSERT INTO bfs_players (player_id, via_club, via_season, depth)
    SELECT DISTINCT ON (m.player_id) m.player_id, c.club_id, c.season, v_depth + 1
      FROM bfs_club_seasons c
      JOIN memberships m ON m.sport = p_sport AND m.club_id = c.club_id AND m.season = c.season
     WHERE c.depth = v_depth
       AND NOT EXISTS (SELECT 1 FROM bfs_players w WHERE w.player_id = m.player_id)
     ORDER BY m.player_id, c.club_id, c.season;

    GET DIAGNOSTICS v_added = ROW_COUNT;
    v_depth := v_depth + 1;

    EXIT WHEN v_added = 0 OR EXISTS (SELECT 1 FROM bfs_players WHERE player_id = p_to);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM bfs_players WHERE player_id = p_to) THEN
    RETURN NULL;
  END IF;

  v_path := ARRAY[p_to];
  v_current := p_to;
  LOOP
    SELECT via_club, via_season INTO v_club_id, v_season FROM bfs_players WHERE player_id = v_current;
    EXIT WHEN v_club_id IS NULL;
    SELECT via_player INTO v_current FROM bfs_club_seasons WHERE club_id = v_club_id AND season = v_season;
    v_path := array_prepend(v_current, v_path);
  END LOOP;

  RETURN v_path;
END;
$$;

-- ─── Drawing the day's pair ───────────────────────────────────────────────────

-- Returns the (sport, day) row, drawing it first if it does not exist yet. Idempotent: every
-- call after the first returns the stored row untouched.
--
-- Called by `ensure_daily_challenges` (the cron job) and by the API's lazy fallback.
CREATE FUNCTION public.generate_daily_challenge(p_sport text, p_day date)
RETURNS daily_challenges
LANGUAGE plpgsql AS $$
DECLARE
  max_attempts constant integer := 20;
  v_row daily_challenges;
  v_candidates text[];
  v_count integer;
  v_a text;
  v_b text;
  v_path text[];
  v_launch date;
BEGIN
  -- Fast path, no lock: every call of the day but the first ends here.
  SELECT * INTO v_row FROM daily_challenges WHERE sport = p_sport AND day = p_day;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- One draw at a time per sport, until the transaction ends. A concurrent draw of the same
  -- day — the job and a visitor, or two visitors — waits here, then finds the row the winner
  -- wrote. It also keeps two first-ever draws from each claiming to be the launch day.
  PERFORM pg_advisory_xact_lock(hashtext('daily_challenges:' || p_sport));

  SELECT * INTO v_row FROM daily_challenges WHERE sport = p_sport AND day = p_day;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT min(day) INTO v_launch FROM daily_challenges WHERE sport = p_sport;
  IF p_day < v_launch THEN
    RAISE EXCEPTION 'generate_daily_challenge: % is before the % launch day (%)', p_day, p_sport, v_launch;
  END IF;

  SELECT array_agg(DISTINCT player_id) INTO v_candidates FROM memberships WHERE sport = p_sport;
  v_count := coalesce(array_length(v_candidates, 1), 0);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'generate_daily_challenge: fewer than 2 players with memberships in sport %', p_sport;
  END IF;

  FOR attempt IN 1..max_attempts LOOP
    v_a := v_candidates[1 + floor(random() * v_count)::integer];
    v_b := v_candidates[1 + floor(random() * v_count)::integer];
    CONTINUE WHEN v_a = v_b;

    v_path := public.player_shortest_path(p_sport, v_a, v_b);

    -- At least 3 players, i.e. at least 2 links: see "How the pair is drawn" above.
    IF v_path IS NOT NULL AND array_length(v_path, 1) >= 3 THEN
      -- Numbered by the calendar. With no row yet for the sport, this draw IS the launch: #1.
      INSERT INTO daily_challenges (sport, day, number, player_a_id, player_b_id, optimal_links, solution)
      VALUES (p_sport, p_day, p_day - coalesce(v_launch, p_day) + 1, v_a, v_b, array_length(v_path, 1) - 1, v_path)
      RETURNING * INTO v_row;
      RETURN v_row;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'generate_daily_challenge: no solvable pair for % on % after % attempts',
    p_sport, p_day, max_attempts;
END;
$$;

-- ─── Posting every day ────────────────────────────────────────────────────────

-- Draws every missing challenge from each sport's launch day through the day after p_today,
-- for every sport that has memberships. Returns how many were drawn — 0 on almost every run.
--
-- Sports come from `memberships`, not from a list: a sport appears here the day its import
-- lands, and nothing in this file names one.
--
-- A sport never launched starts at p_today, not earlier: the job must not invent a past.
CREATE FUNCTION public.ensure_daily_challenges(p_today date)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_sport text;
  v_day date;
  v_drawn integer := 0;
BEGIN
  FOR v_sport IN SELECT DISTINCT sport FROM memberships ORDER BY sport LOOP
    FOR v_day IN
      SELECT d::date
        FROM generate_series(
               (SELECT coalesce(min(day), p_today) FROM daily_challenges WHERE sport = v_sport),
               p_today + 1,
               interval '1 day') AS d
       WHERE NOT EXISTS (SELECT 1 FROM daily_challenges c WHERE c.sport = v_sport AND c.day = d::date)
       ORDER BY d
    LOOP
      PERFORM public.generate_daily_challenge(v_sport, v_day);
      v_drawn := v_drawn + 1;
    END LOOP;
  END LOOP;
  RETURN v_drawn;
END;
$$;

-- Supabase grants EXECUTE on new functions to anon and authenticated by default. Only the
-- server calls these.
REVOKE EXECUTE ON FUNCTION public.player_shortest_path(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_daily_challenge(text, date)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_daily_challenges(date)          FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_shortest_path(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_daily_challenge(text, date)   TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_daily_challenges(date)          TO service_role;

-- ─── The job ──────────────────────────────────────────────────────────────────

-- pg_cron ships with Supabase; this enables it if the dashboard has not already. The job runs
-- as the migration's role (postgres), which owns the functions above.
--
-- `cron.schedule` with a name replaces a job of the same name, so re-running this is safe.
-- At :05 rather than :00, clear of anything else scheduled on the hour.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'ensure-daily-challenges',
  '5 * * * *',
  $$SELECT public.ensure_daily_challenges((now() AT TIME ZONE 'Europe/Paris')::date)$$
);

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- Applying this migration LAUNCHES the series: the job's first run (at the next :05) draws #1
-- for today, Paris time, and #2 for tomorrow. Run it now instead of waiting — and never with
-- `current_date`, which is the UTC day and would fix the wrong launch day late at night:
--   SELECT public.ensure_daily_challenges((now() AT TIME ZONE 'Europe/Paris')::date);  -- -> 2 per sport
--   SELECT public.ensure_daily_challenges((now() AT TIME ZONE 'Europe/Paris')::date);  -- -> 0
--   SELECT sport, day, number, optimal_links FROM daily_challenges ORDER BY sport, day;

-- The job is scheduled, and its runs succeed (after the first :05):
--   SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'ensure-daily-challenges';
--   SELECT status, return_message, start_time FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'ensure-daily-challenges')
--    ORDER BY start_time DESC LIMIT 5;
--
-- Every day from launch through tomorrow exists, numbered by the calendar. Both must return
-- no row:
--   SELECT sport FROM daily_challenges GROUP BY sport
--   HAVING count(*) <> max(day) - min(day) + 1;                            -- a missing day
--   SELECT sport, day, number FROM (
--     SELECT sport, day, number, min(day) OVER (PARTITION BY sport) AS launch FROM daily_challenges
--   ) d WHERE number <> day - launch + 1;                                   -- a wrong number
--
-- The solution is a real chain — every consecutive pair shares a (club, season). Must return 0:
--   SELECT count(*)
--     FROM daily_challenges d,
--          generate_subscripts(d.solution, 1) AS i
--    WHERE i < array_length(d.solution, 1)
--      AND NOT EXISTS (
--        SELECT 1 FROM memberships m1
--          JOIN memberships m2 ON m2.sport = m1.sport AND m2.club_id = m1.club_id AND m2.season = m1.season
--         WHERE m1.sport = d.sport AND m1.player_id = d.solution[i] AND m2.player_id = d.solution[i + 1]);
--
-- Cost of one search, on a real pair (record the timing in the PR):
--   EXPLAIN ANALYZE SELECT player_shortest_path('football', '<id A>', '<id B>');
--
-- Not readable by the public key — as anon, both must fail with "permission denied":
--   SET ROLE anon; SELECT * FROM daily_challenges; RESET ROLE;
--   SET ROLE anon; SELECT generate_daily_challenge('rugby', '2000-01-01'); RESET ROLE;
