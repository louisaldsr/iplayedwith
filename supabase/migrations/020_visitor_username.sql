-- One `username` column instead of 018's three name columns.
--
-- A generated name is stored as its three KEYS joined by ':' — "laidBack:playmaker:742" — and
-- still read in the viewer's language ("Demi d'ouverture Décontracté 742", "Laid-back Playmaker
-- 742"): the app splits it back (src/domain/visitorName.ts). One column is where a typed username
-- will go too, once accounts exist: a value that does not split into known keys is shown as typed.
-- So a typed username must never contain ':' — that is what tells the two apart.
--
-- Unique, generated or typed: the index below is the only guard. The server draws all three parts
-- at random and, on a clash, draws all three again (`ensureVisitorName`); a typed username that is
-- taken will be refused by the same index.
--
-- The server now draws the number too — 018's search for a free number per pair goes. With
-- 1,120,000 names, a clash is rare long before the names run low.
--
-- `ensure_visitor` takes the username and returns the stored one; `daily_ranking` returns
-- `username`. Both change shape, hence DROP + CREATE: apply this and deploy the build that reads it
-- together. In between, a new visitor gets no name (logged, badge hidden) — results still count.
--
-- Depends on 018_visitor_number.sql. Apply as ONE transaction in the Supabase SQL editor.
-- Rollback: 020_visitor_username_rollback.sql.

BEGIN;

ALTER TABLE visitors ADD COLUMN username text;

UPDATE visitors SET username = name_adjective || ':' || name_noun || ':' || lpad(name_number::text, 3, '0');

ALTER TABLE visitors ALTER COLUMN username SET NOT NULL;
ALTER TABLE visitors ADD CONSTRAINT visitors_username_check CHECK (username <> '');

CREATE UNIQUE INDEX visitors_username_key ON visitors (username);

-- The functions read the old columns: drop them first. Dropping the columns drops 018's
-- `visitors_name_key` index with them.
DROP FUNCTION public.ensure_visitor(uuid, text, text);
DROP FUNCTION public.daily_ranking(text, date);

ALTER TABLE visitors DROP COLUMN name_adjective, DROP COLUMN name_noun, DROP COLUMN name_number;

-- ─── First sight of a visitor ─────────────────────────────────────────────────
--
-- Returns the visitor's username. An existing visitor keeps the one it has — `p_username` is then
-- ignored. A new visitor gets `p_username`, or the insert fails on the unique index when someone
-- has it already, and the server draws again.
CREATE FUNCTION public.ensure_visitor(p_id uuid, p_username text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM visitors WHERE id = p_id) THEN
    INSERT INTO visitors (id, username) VALUES (p_id, p_username) ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN (SELECT username FROM visitors WHERE id = p_id);
END;
$$;

-- ─── The ranking, with the username ───────────────────────────────────────────
CREATE FUNCTION public.daily_ranking(p_sport text, p_day date)
RETURNS TABLE (
  rank         bigint,
  visitor_id   uuid,
  username     text,
  attempts     integer,
  duration_ms  bigint,
  lives_lost   integer,
  links        integer,
  hints        integer,
  finished_at  timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT rank() OVER (ORDER BY r.attempts, r.finished_at - r.started_at),
         r.visitor_id,
         v.username,
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

REVOKE EXECUTE ON FUNCTION public.ensure_visitor(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.daily_ranking(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_visitor(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_ranking(text, date) TO service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- Every visitor kept its name, in the new form (11 visitors when this was written):
--   SELECT id, username FROM visitors ORDER BY created_at;     -- laidBack:playmaker:742, …
--
-- A name is returned and kept; a taken one is refused — rolled back, nothing stays:
--   BEGIN;
--   SELECT ensure_visitor('00000000-0000-4000-8000-000000000001', 'hasty:prop:042');  -- hasty:prop:042
--   SELECT ensure_visitor('00000000-0000-4000-8000-000000000001', 'shy:winger:001');  -- hasty:prop:042
--   SELECT ensure_visitor('00000000-0000-4000-8000-000000000002', 'hasty:prop:042');  -- unique violation
--   ROLLBACK;

