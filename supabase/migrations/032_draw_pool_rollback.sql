-- Undoes 032_draw_pool.sql: back to the draw live before it, 022_daily_fame_band_raise — both
-- players uniform in the fame band 75..100, then uniform among every connected player.
--
-- Days already drawn keep their pair — they are frozen either way. Revert the app with it: the
-- Randomize button calls `random_pool_player`, dropped here (src/repositories/playersRepository.ts);
-- without it, Randomize falls back to a uniform pick over the whole sport.

BEGIN;

DROP FUNCTION public.random_pool_player(text, text);

CREATE OR REPLACE FUNCTION public.generate_daily_challenge(p_sport text, p_day date)
RETURNS daily_challenges
LANGUAGE plpgsql AS $$
DECLARE
  max_attempts constant integer := 20;
  -- DRAW_FAME_BAND in src/domain/drawFameBand.ts. Change both together.
  band_min constant integer := 75;
  band_max constant integer := 100;
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

DROP FUNCTION public.draw_partner_range(double precision);
DROP FUNCTION public.draw_pool(text);
DROP TABLE draw_settings;

COMMIT;
