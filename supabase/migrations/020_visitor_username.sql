-- One `username` column instead of 018's three name columns — and a visitor can rename itself.
--
-- A generated name is stored as its three KEYS joined by ':' — "laidBack:playmaker:742" — and
-- still read in the viewer's language ("Demi d'ouverture Décontracté 742", "Laid-back Playmaker
-- 742"): the app splits it back (src/domain/visitorName.ts). One column is where a typed username
-- will go too, once accounts exist: a value that does not split into known keys is shown as typed.
-- So a typed username must never contain ':' — that is what tells the two apart.
--
-- Unique, generated or typed, ONCE NORMALIZED (`search_normalize`, the player search's rule): "Dupont",
-- "dupont" and "Dupönt" are one name, so nobody can pass for someone else by a capital or an accent.
-- The index below is the only guard. The server draws all three parts at random and, on a clash,
-- draws all three again (`ensureUsername`); a typed username that is taken is refused by the same
-- index (`rename_visitor` → 'taken').
--
-- A typed username is validated by the server (src/domain/username.ts): 3 to 20 characters,
-- letters, digits, spaces and . _ ' - only. Not here: the rule will move, the column should not.
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

CREATE UNIQUE INDEX visitors_username_key ON visitors (public.search_normalize(username));

-- Renaming is the first UPDATE on this table, and only of the username.
GRANT UPDATE (username) ON visitors TO service_role;

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

-- ─── Renaming ──────────────────────────────────────────────────────────────────
--
-- 'renamed'; 'taken' when another visitor has the same name once normalized; 'unknown' for an id
-- the server never saw. A visitor renaming to its own name, even with other capitals, is 'renamed':
-- a row never clashes with itself.
CREATE FUNCTION public.rename_visitor(p_id uuid, p_username text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE visitors SET username = p_username WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN 'unknown';
  END IF;
  RETURN 'renamed';
EXCEPTION WHEN unique_violation THEN
  RETURN 'taken';
END;
$$;

-- The candidates nobody has yet, once normalized — the suggestions offered when a name is taken.
CREATE FUNCTION public.free_usernames(p_candidates text[])
RETURNS SETOF text
LANGUAGE sql
STABLE
AS $$
  SELECT c
    FROM unnest(p_candidates) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM visitors v WHERE public.search_normalize(v.username) = public.search_normalize(c));
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
REVOKE EXECUTE ON FUNCTION public.rename_visitor(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.free_usernames(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_visitor(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rename_visitor(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.free_usernames(text[]) TO service_role;
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
--
-- Renaming — rolled back too:
--   BEGIN;
--   SELECT ensure_visitor('00000000-0000-4000-8000-000000000001', 'hasty:prop:042');
--   SELECT ensure_visitor('00000000-0000-4000-8000-000000000002', 'shy:winger:001');
--   SELECT rename_visitor('00000000-0000-4000-8000-000000000001', 'Dupont');          -- renamed
--   SELECT rename_visitor('00000000-0000-4000-8000-000000000001', 'DUPONT');          -- renamed (itself)
--   SELECT rename_visitor('00000000-0000-4000-8000-000000000002', 'Dupönt');          -- taken
--   SELECT rename_visitor('00000000-0000-4000-8000-000000000003', 'Zidane');          -- unknown
--   SELECT * FROM free_usernames(ARRAY['dupont', 'Dupont7']);                         -- Dupont7
--   ROLLBACK;
