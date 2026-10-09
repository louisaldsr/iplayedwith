-- The draw, reworked: a pool of each sport's N most famous players, a partner picked on a
-- sliding scale, a memory of recent days, and a preferred distance.
--
-- ─── What was wrong ───────────────────────────────────────────────────────────
--
-- 019 drew both players uniformly from a fame band, 60..80. Players found the pairs too obscure,
-- so the band was raised to 75..100 straight in the database (022_daily_fame_band_raise, on a
-- branch never merged). An absolute band gives each sport whatever its score scale happens to put
-- above the line — measured on 2026-10-09, connected players at 75+: rugby 102, football 129,
-- basketball 15, formula1 22. With 15 names, basketball drew Jokić → Durant on #1 and again on #3;
-- Barrichello opened Formula 1's #1 and #2. Nothing remembered past days, and 21 of the first 28
-- pairs sat 2 links apart.
--
-- ─── The pool: top N, per sport ───────────────────────────────────────────────
--
-- A sport's N most famous players with at least one membership, ranked by score (player id breaks
-- ties, so the ranking is stable). N lives in `draw_settings`, per sport — the function never
-- branches on the sport. A player's place in the pool is its OBSCURITY, 0 for the most famous to
-- 1 for the last of the pool: rank-based, so it means the same thing in a pool of 60 or of 200.
--
--   rugby 200 (down to 65), football 200 (down to 70) — about the 75+ band players asked for on
--                             2026-10-05, deep enough to last
--   basketball 120 (down to 59) — the NBA's 70+ holds 40 names
--   formula1 60 (down to 57)    — Hunt, Russell, Montoya, Gilles Villeneuve…
--
-- ─── The pair: a sliding scale ────────────────────────────────────────────────
--
-- A is drawn uniformly from the pool. B is drawn uniformly from a window that depends on A — the
-- better known A is, the deeper B may be:
--
--   target(A) = 0.6 − 0.5 × obscurity(A)        window = target ± 0.2, clipped to [0, 1]
--
--   A a star        (0.0) → B in 0.4..0.8   a bit further down the pool
--   A in the middle (0.5) → B in 0.15..0.55 about as famous, or a little more
--   A at the bottom (1.0) → B in 0.0..0.3   among the best known
--
-- So every day has at least one name most players know. The two are then shown in a random order:
-- the star is not always on the same side. Constants written once, in `draw_partner_range` —
-- Randomize in free play reads the same function.
--
-- ─── Memory ───────────────────────────────────────────────────────────────────
--
-- A player drawn within `recent_days` of the day (either side — tomorrow is drawn before today
-- ends) is left out, and a pair already drawn on any day is never drawn again, in either order.
-- `recent_days` is per sport: two players a day must leave most of the pool free.
--
--   rugby 30, football 30 (60 of 200 out) · basketball 20 (40 of 120) · formula1 10 (20 of 60)
--
-- ─── Distance: 2 to 4 links, 3 preferred ──────────────────────────────────────
--
-- 2 links remains the floor (at 1, easy mode solves the pair by itself — see 013). Beyond 4 a pair
-- is refused: the chain needs players nobody has heard of. A 3-link pair is kept at once; a 2- or
-- 4-link pair is kept at once only with probability 0.2, otherwise held while the draw tries for
-- a 3 — and kept if none comes in 15 attempts.
--
-- How often a 3 comes depends on the graph. Among raw pool pairs (300 per sport, local copy of
-- 2026-10-09): rugby and football 7 % at 3 links — their stars share a handful of big clubs —
-- basketball 19 %, formula1 24 % (and 30 % beyond 4: its pool spans 75 years). Simulated over
-- 120 days: 3 links on rugby 23 %, football 33 %, basketball 58 %, formula1 66 % of days, against
-- 21 of 28 days at 2 before. ~70 ms a draw.
--
-- Rugby and football mostly at 2 is accepted (2026-10-09): with rosters that large, a player who
-- misses the one shared teammate still has plenty of other ways through.
--
-- ─── Fallbacks ────────────────────────────────────────────────────────────────
--
-- Pass 1 is the above. Pass 2 relaxes everything but the 2-link floor: uniform in the pool, no
-- memory. Pass 3 is 013's draw: uniform among every connected player — a sport with no
-- `draw_settings` row or no scores yet still gets its daily.
--
-- ─── Free play ────────────────────────────────────────────────────────────────
--
-- `random_pool_player(sport, partner)` backs the Randomize button: uniform in the pool, or in the
-- partner's window when the other slot already holds a pool player. NULL when the pool is empty:
-- the app then falls back to a uniform pick. Replaces DRAW_FAME_BAND (src/domain/drawFameBand.ts),
-- removed: the draw's constants now live in this file only.
--
-- Supersedes 019 and 022_daily_fame_band_raise. Days already drawn stay frozen — tomorrow included
-- (post-apply checks to redraw it).
--
-- Depends on 013 (player_shortest_path, daily_challenges), 027 (sports), 010 (player_fame).
-- Apply as ONE transaction in the Supabase SQL editor. Rollback: 032_draw_pool_rollback.sql.

BEGIN;

CREATE TABLE draw_settings (
  sport       text    PRIMARY KEY REFERENCES sports (id),
  pool_size   integer NOT NULL CHECK (pool_size >= 10),
  recent_days integer NOT NULL CHECK (recent_days >= 0)
);

-- Read by free play's Randomize through the anon client, like fame_calibration.
ALTER TABLE draw_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read draw_settings" ON draw_settings FOR SELECT USING (true);
GRANT SELECT ON draw_settings TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON draw_settings TO service_role;

INSERT INTO draw_settings (sport, pool_size, recent_days) VALUES
  ('rugby',      200, 30),
  ('football',   200, 30),
  ('basketball', 120, 20),
  ('formula1',    60, 10);

-- The pool, most famous first. Empty without a draw_settings row or without scores.
CREATE FUNCTION public.draw_pool(p_sport text)
RETURNS TABLE (player_id text, obscurity double precision)
LANGUAGE sql STABLE AS $$
  WITH ranked AS (
    SELECT f.player_id, row_number() OVER (ORDER BY f.score DESC, f.player_id) AS pool_rank
      FROM player_fame f
     WHERE f.sport = p_sport
       AND f.score IS NOT NULL
       AND EXISTS (SELECT 1 FROM memberships m WHERE m.sport = f.sport AND m.player_id = f.player_id)
     ORDER BY f.score DESC, f.player_id
     LIMIT (SELECT pool_size FROM draw_settings WHERE sport = p_sport)
  )
  SELECT player_id,
         coalesce((pool_rank - 1)::double precision / nullif(count(*) OVER () - 1, 0), 0)
    FROM ranked
   ORDER BY pool_rank
$$;

-- The window B's obscurity is drawn from, given A's.
CREATE FUNCTION public.draw_partner_range(p_obscurity double precision, OUT lo double precision, OUT hi double precision)
LANGUAGE sql IMMUTABLE AS $$
  SELECT greatest(0, t - 0.2), least(1, t + 0.2) FROM (SELECT 0.6 - 0.5 * p_obscurity AS t) target
$$;

CREATE OR REPLACE FUNCTION public.generate_daily_challenge(p_sport text, p_day date)
RETURNS daily_challenges
LANGUAGE plpgsql AS $$
DECLARE
  max_attempts constant integer := 15;
  keep_off_target constant double precision := 0.2;
  v_row daily_challenges;
  v_ids text[];
  v_obscurities double precision[];
  v_recent text[];
  v_recent_days integer;
  v_count integer;
  v_a text;
  v_b text;
  v_obscurity double precision;
  v_lo double precision;
  v_hi double precision;
  v_path text[];
  v_links integer;
  v_held text[];
  v_launch date;
BEGIN
  -- Fast path, no lock: every call of the day but the first ends here.
  SELECT * INTO v_row FROM daily_challenges WHERE sport = p_sport AND day = p_day;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- One draw at a time per sport, until the transaction ends (see 013).
  PERFORM pg_advisory_xact_lock(hashtext('daily_challenges:' || p_sport));

  SELECT * INTO v_row FROM daily_challenges WHERE sport = p_sport AND day = p_day;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT min(day) INTO v_launch FROM daily_challenges WHERE sport = p_sport;
  IF p_day < v_launch THEN
    RAISE EXCEPTION 'generate_daily_challenge: % is before the % launch day (%)', p_day, p_sport, v_launch;
  END IF;

  SELECT array_agg(p.player_id), array_agg(p.obscurity) INTO v_ids, v_obscurities FROM public.draw_pool(p_sport) p;
  v_count := coalesce(array_length(v_ids, 1), 0);

  SELECT recent_days INTO v_recent_days FROM draw_settings WHERE sport = p_sport;
  SELECT coalesce(array_agg(x.player_id), '{}') INTO v_recent
    FROM daily_challenges d, LATERAL (VALUES (d.player_a_id), (d.player_b_id)) x (player_id)
   WHERE d.sport = p_sport AND abs(d.day - p_day) <= coalesce(v_recent_days, 0);

  -- Pass 1: the sliding scale, with memory, 2..4 links, 3 preferred.
  IF v_count >= 2 THEN
    FOR attempt IN 1..max_attempts LOOP
      SELECT id, o INTO v_a, v_obscurity
        FROM unnest(v_ids, v_obscurities) pool (id, o)
       WHERE id <> ALL (v_recent)
       ORDER BY random() LIMIT 1;
      EXIT WHEN v_a IS NULL;

      SELECT lo, hi INTO v_lo, v_hi FROM public.draw_partner_range(v_obscurity);
      SELECT id INTO v_b
        FROM unnest(v_ids, v_obscurities) pool (id, o)
       WHERE o BETWEEN v_lo AND v_hi
         AND id <> v_a
         AND id <> ALL (v_recent)
         AND NOT EXISTS (
               SELECT 1 FROM daily_challenges d
                WHERE d.sport = p_sport
                  AND ((d.player_a_id = v_a AND d.player_b_id = id) OR (d.player_a_id = id AND d.player_b_id = v_a)))
       ORDER BY random() LIMIT 1;
      CONTINUE WHEN v_b IS NULL;

      v_path := public.player_shortest_path(p_sport, v_a, v_b);
      v_links := coalesce(array_length(v_path, 1), 0) - 1;
      CONTINUE WHEN v_path IS NULL OR v_links NOT BETWEEN 2 AND 4;

      IF v_links = 3 OR random() < keep_off_target THEN
        v_held := v_path;
        EXIT;
      END IF;
      v_held := coalesce(v_held, v_path);
    END LOOP;
  END IF;

  -- Pass 2: the pool, uniform, no memory. Pass 3: every connected player (013's draw).
  FOR pass IN 2..3 LOOP
    EXIT WHEN v_held IS NOT NULL;
    IF pass = 3 THEN
      SELECT array_agg(DISTINCT player_id) INTO v_ids FROM memberships WHERE sport = p_sport;
      v_count := coalesce(array_length(v_ids, 1), 0);
    END IF;
    CONTINUE WHEN v_count < 2;

    FOR attempt IN 1..20 LOOP
      v_a := v_ids[1 + floor(random() * v_count)::integer];
      v_b := v_ids[1 + floor(random() * v_count)::integer];
      CONTINUE WHEN v_a = v_b;
      v_path := public.player_shortest_path(p_sport, v_a, v_b);
      IF v_path IS NOT NULL AND array_length(v_path, 1) >= 3 THEN
        v_held := v_path;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  IF v_held IS NULL THEN
    RAISE EXCEPTION 'generate_daily_challenge: no solvable pair for % on %', p_sport, p_day;
  END IF;

  -- The star is not always on the same side.
  IF random() < 0.5 THEN
    SELECT array_agg(id ORDER BY ord DESC) INTO v_held FROM unnest(v_held) WITH ORDINALITY s (id, ord);
  END IF;

  -- Numbered by the calendar. With no row yet for the sport, this draw IS the launch: #1.
  INSERT INTO daily_challenges (sport, day, number, player_a_id, player_b_id, optimal_links, solution)
  VALUES (p_sport, p_day, p_day - coalesce(v_launch, p_day) + 1,
          v_held[1], v_held[array_length(v_held, 1)], array_length(v_held, 1) - 1, v_held)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- Free play's Randomize: a pool player, in the partner's window when the partner is in the pool.
-- No row when the pool is empty.
CREATE FUNCTION public.random_pool_player(p_sport text, p_partner text DEFAULT NULL)
RETURNS SETOF players
LANGUAGE sql STABLE AS $$
  WITH pool AS (SELECT * FROM public.draw_pool(p_sport)),
  partner_range AS (
    SELECT r.lo, r.hi FROM pool, public.draw_partner_range(pool.obscurity) r WHERE pool.player_id = p_partner
  )
  SELECT pl.*
    FROM pool
    JOIN players pl ON pl.id = pool.player_id AND pl.sport = p_sport
   WHERE pool.player_id IS DISTINCT FROM p_partner
     AND (NOT EXISTS (SELECT 1 FROM partner_range) OR pool.obscurity BETWEEN (SELECT lo FROM partner_range) AND (SELECT hi FROM partner_range))
   ORDER BY random()
   LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.generate_daily_challenge(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_daily_challenge(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.draw_pool(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.draw_partner_range(double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.random_pool_player(text, text) TO anon, authenticated, service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- The live draw was 022_daily_fame_band_raise (75..100) before this — confirm it is replaced:
--   SELECT pg_get_functiondef('public.generate_daily_challenge'::regproc) LIKE '%draw_pool%';  -- -> t
--
-- Each pool, and the score at its bottom:
--   SELECT s.sport, count(*), min(f.score) FROM draw_settings s
--     CROSS JOIN LATERAL public.draw_pool(s.sport) p
--     JOIN player_fame f ON f.sport = s.sport AND f.player_id = p.player_id GROUP BY s.sport;
--   -- rugby 200 / 65, football 200 / 70, basketball 120 / 59, formula1 60 / 57 on 2026-10-09
--
-- Randomize, alone then next to a star:
--   SELECT name FROM public.random_pool_player('formula1');
--   SELECT name FROM public.random_pool_player('formula1', (SELECT id FROM players WHERE name = 'Lewis Hamilton'));
--
-- Redraw tomorrow under the new rule. Safe: nobody can have played a day that has not started.
-- The FK from `daily_results` CASCADEs, so check first that this returns 0 — then delete. Paris
-- time, never `current_date`:
--   SELECT count(*) FROM daily_results WHERE day > (now() AT TIME ZONE 'Europe/Paris')::date;  -- -> 0
--   DELETE FROM daily_challenges WHERE day > (now() AT TIME ZONE 'Europe/Paris')::date;
--   SELECT public.ensure_daily_challenges((now() AT TIME ZONE 'Europe/Paris')::date);
--
-- The days drawn from now on, with both scores:
--   SELECT c.sport, c.day, c.number, c.optimal_links, fa.score AS score_a, fb.score AS score_b
--     FROM daily_challenges c
--     JOIN player_fame fa ON fa.sport = c.sport AND fa.player_id = c.player_a_id
--     JOIN player_fame fb ON fb.sport = c.sport AND fb.player_id = c.player_b_id
--    ORDER BY c.sport, c.day DESC;
