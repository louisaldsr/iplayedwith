-- Undoes 019_daily_fame_band.sql: back to 013's uniform draw among every connected player.
--
-- Days already drawn keep their pair — they are frozen either way. Set DRAW_FAME_BAND aside in
-- the app too if the Randomize button should go back to uniform (src/services/playersService.ts).

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_daily_challenge(p_sport text, p_day date)
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

COMMIT;
