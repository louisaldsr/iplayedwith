-- Undoes 020_visitor_username.sql: back to 018's three name columns.
--
-- Only while every username is a generated one ("adjective:noun:042"): a typed username (a
-- rename) has no three parts to split into, and the SET NOT NULL below fails on it rather than
-- lose it. Find them with:  SELECT id, username FROM visitors WHERE username !~ ':';
--
-- Deploy a build that reads 018's columns BEFORE running this.

BEGIN;

ALTER TABLE visitors
  ADD COLUMN name_adjective text,
  ADD COLUMN name_noun      text,
  ADD COLUMN name_number    smallint CHECK (name_number BETWEEN 0 AND 999);

UPDATE visitors
   SET name_adjective = split_part(username, ':', 1),
       name_noun      = split_part(username, ':', 2),
       name_number    = split_part(username, ':', 3)::smallint
 WHERE username ~ '^[A-Za-z]+:[A-Za-z]+:[0-9]{3}$';

ALTER TABLE visitors
  ALTER COLUMN name_adjective SET NOT NULL,
  ALTER COLUMN name_noun      SET NOT NULL,
  ALTER COLUMN name_number    SET NOT NULL;

CREATE UNIQUE INDEX visitors_name_key ON visitors (name_adjective, name_noun, name_number);

DROP FUNCTION public.rename_visitor(uuid, text);
DROP FUNCTION public.free_usernames(text[]);
DROP FUNCTION public.ensure_visitor(uuid, text);
REVOKE UPDATE (username) ON visitors FROM service_role;
DROP FUNCTION public.daily_ranking(text, date);

ALTER TABLE visitors DROP COLUMN username;

-- 018's functions, unchanged.
CREATE FUNCTION public.ensure_visitor(p_id uuid, p_name_adjective text, p_name_noun text)
RETURNS TABLE (name_adjective text, name_noun text, name_number smallint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_number smallint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM visitors WHERE id = p_id) THEN
    SELECT g INTO v_number
      FROM generate_series(0, 999) g
     WHERE NOT EXISTS (
       SELECT 1 FROM visitors v
        WHERE v.name_adjective = p_name_adjective AND v.name_noun = p_name_noun AND v.name_number = g)
     ORDER BY random()
     LIMIT 1;

    IF v_number IS NULL THEN
      RAISE EXCEPTION 'no free number left for % %', p_name_adjective, p_name_noun;
    END IF;

    INSERT INTO visitors (id, name_adjective, name_noun, name_number)
    VALUES (p_id, p_name_adjective, p_name_noun, v_number)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN QUERY
    SELECT v.name_adjective, v.name_noun, v.name_number FROM visitors v WHERE v.id = p_id;
END;
$$;

CREATE FUNCTION public.daily_ranking(p_sport text, p_day date)
RETURNS TABLE (
  rank            bigint,
  visitor_id      uuid,
  name_adjective  text,
  name_noun       text,
  name_number     smallint,
  attempts        integer,
  duration_ms     bigint,
  lives_lost      integer,
  links           integer,
  hints           integer,
  finished_at     timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT rank() OVER (ORDER BY r.attempts, r.finished_at - r.started_at),
         r.visitor_id,
         v.name_adjective,
         v.name_noun,
         v.name_number,
         r.attempts,
         (extract(epoch FROM r.finished_at - r.started_at) * 1000)::bigint,
         r.lives_lost,
         r.links,
         cardinality(r.hint_player_ids),
         r.finished_at
    FROM daily_results r
    LEFT JOIN visitors v ON v.id = r.visitor_id
   WHERE r.sport = p_sport AND r.day = p_day AND r.outcome = 'won'
   ORDER BY 1, r.finished_at;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_visitor(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_visitor(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;

COMMIT;
