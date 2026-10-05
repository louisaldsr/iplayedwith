-- The daily challenge draws its pair from a fame band: players scoring 60..80.
--
-- 013 drew uniformly among every connected player, and most of a sport scores low: two thirds of
-- rugby and four fifths of football are `unsung` (see src/domain/fameFloor.ts). A new player's
-- first challenge was two names they had never heard of. The band aims just below stardom —
-- names worth knowing, without the stars whose chain everyone finds at once. Measured on
-- revision 2: 427 rugby players, 787 football players.
--
-- A SCORE band, not a floor: it straddles the top of `known` and the bottom of `famous`.
-- Written twice — the constants below, and DRAW_FAME_BAND (src/domain/drawFameBand.ts), which
-- free play's "Randomize" reads. Change both together.
--
-- Nothing else moves: still at least 2 links, still 20 attempts — now per pool. When the band
-- cannot give a pair (fewer than 2 scored players, or 20 draws all rejected), the draw falls
-- back to 013's pool, every connected player: a day is never left without a challenge.
--
-- Past days are frozen, so this only changes days drawn after it is applied. The job has
-- already drawn TOMORROW under the old rule — see the post-apply checks to redraw it.
--
-- The signature does not change, so CREATE OR REPLACE keeps 013's grants (service_role only).
--
-- Depends on 013_daily_challenges.sql and 012_fame_score.sql (player_fame.score).
-- Apply as ONE transaction in the Supabase SQL editor. Rollback: 019_daily_fame_band_rollback.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_daily_challenge(p_sport text, p_day date)
RETURNS daily_challenges
LANGUAGE plpgsql AS $$
DECLARE
  max_attempts constant integer := 20;
  -- DRAW_FAME_BAND in src/domain/drawFameBand.ts. Change both together.
  band_min constant integer := 60;
  band_max constant integer := 80;
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

  -- Pass 1 draws from the fame band, pass 2 from every connected player — reached only when
  -- the band cannot give a pair (scores not computed yet, or 20 unlucky attempts).
  FOR pass IN 1..2 LOOP
    IF pass = 1 THEN
      SELECT array_agg(f.player_id) INTO v_candidates
        FROM player_fame f
       WHERE f.sport = p_sport
         AND f.score BETWEEN band_min AND band_max
         AND EXISTS (SELECT 1 FROM memberships m WHERE m.sport = f.sport AND m.player_id = f.player_id);
    ELSE
      SELECT array_agg(DISTINCT player_id) INTO v_candidates FROM memberships WHERE sport = p_sport;
    END IF;

    v_count := coalesce(array_length(v_candidates, 1), 0);
    CONTINUE WHEN v_count < 2;

    FOR attempt IN 1..max_attempts LOOP
      v_a := v_candidates[1 + floor(random() * v_count)::integer];
      v_b := v_candidates[1 + floor(random() * v_count)::integer];
      CONTINUE WHEN v_a = v_b;

      v_path := public.player_shortest_path(p_sport, v_a, v_b);

      -- At least 3 players, i.e. at least 2 links: see "How the pair is drawn" in 013.
      IF v_path IS NOT NULL AND array_length(v_path, 1) >= 3 THEN
        -- Numbered by the calendar. With no row yet for the sport, this draw IS the launch: #1.
        INSERT INTO daily_challenges (sport, day, number, player_a_id, player_b_id, optimal_links, solution)
        VALUES (p_sport, p_day, p_day - coalesce(v_launch, p_day) + 1, v_a, v_b, array_length(v_path, 1) - 1, v_path)
        RETURNING * INTO v_row;
        RETURN v_row;
      END IF;
    END LOOP;
  END LOOP;

  RAISE EXCEPTION 'generate_daily_challenge: no solvable pair for % on % after % attempts per pool',
    p_sport, p_day, max_attempts;
END;
$$;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- The band's pool per sport — connected players only. Measured before applying: rugby 427,
-- football 787 (a few may lack memberships):
--   SELECT f.sport, count(*) FROM player_fame f
--    WHERE f.score BETWEEN 60 AND 80
--      AND EXISTS (SELECT 1 FROM memberships m WHERE m.sport = f.sport AND m.player_id = f.player_id)
--    GROUP BY f.sport;
--
-- Redraw tomorrow under the new rule. Safe: nobody can have played a day that has not started
-- (`record_daily_move` only counts today's pair). The FK from `daily_results` CASCADEs, so check
-- first that this returns 0 — then delete. Paris time, never `current_date`:
--   SELECT count(*) FROM daily_results WHERE day > (now() AT TIME ZONE 'Europe/Paris')::date;  -- -> 0
--   DELETE FROM daily_challenges WHERE day > (now() AT TIME ZONE 'Europe/Paris')::date;
--   SELECT public.ensure_daily_challenges((now() AT TIME ZONE 'Europe/Paris')::date);  -- -> 1 per sport
--
-- Both players of every day drawn from now on are in the band:
--   SELECT c.sport, c.day, c.number, c.optimal_links, fa.score AS score_a, fb.score AS score_b
--     FROM daily_challenges c
--     JOIN player_fame fa ON fa.sport = c.sport AND fa.player_id = c.player_a_id
--     JOIN player_fame fb ON fb.sport = c.sport AND fb.player_id = c.player_b_id
--    ORDER BY c.sport, c.day DESC;
