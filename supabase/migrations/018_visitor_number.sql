-- A number in every visitor's name, making names unique: "Pilier Pressé 042".
--
-- 017's names were an adjective and a noun — 40 × 28 = 1,120 of them, so shared names came
-- quickly (even odds after ~40 visitors). A number from 000 to 999 makes it 1,120,000 names, and a
-- unique index makes each one belong to a single visitor.
--
--   name_number — 0..999, shown zero-padded on three digits. Drawn among the numbers still free
--                 for the visitor's (adjective, noun); if all 1,000 are taken (~1,000 visitors on
--                 one pair — around a million in all), `ensure_visitor` raises and the server
--                 draws another pair.
--
-- `ensure_visitor` now RETURNS the visitor's name — existing or just created — so the menu can
-- show it (`POST /api/visitor`). The return type changes, hence DROP + CREATE; the arguments do
-- not, so a build still on 017 keeps working against it.
--
-- Depends on 017_visitors.sql. Apply as ONE transaction in the Supabase SQL editor.
-- Rollback: 018_visitor_number_rollback.sql.

BEGIN;

ALTER TABLE visitors ADD COLUMN name_number smallint CHECK (name_number BETWEEN 0 AND 999);

-- Existing visitors: a random number each, distinct within their (adjective, noun). A random
-- permutation of 0..999 per pair, dealt in creation order.
UPDATE visitors v
   SET name_number = n.number
  FROM (
    SELECT id,
           (SELECT array_agg(g ORDER BY random()) FROM generate_series(0, 999) g)
             [row_number() OVER (PARTITION BY name_adjective, name_noun ORDER BY created_at)] AS number
      FROM visitors
  ) n
 WHERE n.id = v.id;

ALTER TABLE visitors ALTER COLUMN name_number SET NOT NULL;

CREATE UNIQUE INDEX visitors_name_key ON visitors (name_adjective, name_noun, name_number);

-- ─── First sight of a visitor ─────────────────────────────────────────────────
--
-- Returns the visitor's name. An existing visitor keeps the name it has — the arguments are then
-- ignored. A new one gets the (adjective, noun) drawn by the server and a free number.
--
-- Two new visitors drawing the same free number at the same instant: one insert fails on the
-- unique index, and the server retries with a fresh draw.
DROP FUNCTION public.ensure_visitor(uuid, text, text);

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

-- ─── The ranking, now with the number ─────────────────────────────────────────
DROP FUNCTION public.daily_ranking(text, date);

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

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- Every existing visitor got a number; names are unique — both must return 0:
--   SELECT count(*) FROM visitors WHERE name_number IS NULL;
--   SELECT count(*) FROM (SELECT 1 FROM visitors GROUP BY name_adjective, name_noun, name_number
--                          HAVING count(*) > 1) d;
--
-- A name is returned, and kept — rolled back, nothing stays:
--   BEGIN;
--   SELECT * FROM ensure_visitor('00000000-0000-4000-8000-000000000001', 'hasty', 'prop');
--   SELECT * FROM ensure_visitor('00000000-0000-4000-8000-000000000001', 'shy', 'winger');  -- same
--   ROLLBACK;
