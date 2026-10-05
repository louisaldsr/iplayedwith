-- Renaming: what `PATCH /api/visitor` needs and 020 did not create.
--
-- 020 was applied in its first version — one `username` column, unique as typed. The renaming
-- shipped with the app afterwards (merged with #27) expected more, so every rename failed: the
-- functions below did not exist, and the API answered 500 ("Could not save your name").
--
--   · unique ONCE NORMALIZED (`search_normalize`, the player search's rule): "Dupont", "dupont"
--     and "Dupönt" are one name, so nobody passes for someone else by a capital or an accent;
--   · `service_role` may UPDATE the username — and nothing else;
--   · `rename_visitor` and `free_usernames` (the suggestions offered when a name is taken).
--
-- Safe to run again: every statement replaces what it creates. Swapping the index fails if two
-- names are already the same once normalized — none were when this was written (15 visitors, all
-- generated); the check below finds them.
--
-- Depends on 020_visitor_username.sql. Apply as ONE transaction in the Supabase SQL editor.
-- Rollback: 021_visitor_rename_rollback.sql.

BEGIN;

DROP INDEX IF EXISTS visitors_username_key;
CREATE UNIQUE INDEX visitors_username_key ON visitors (public.search_normalize(username));

-- Renaming is the first UPDATE on this table, and only of the username.
GRANT UPDATE (username) ON visitors TO service_role;

-- 'renamed'; 'taken' when another visitor has the same name once normalized; 'unknown' for an id
-- the server never saw. A visitor renaming to its own name, even with other capitals, is 'renamed':
-- a row never clashes with itself.
CREATE OR REPLACE FUNCTION public.rename_visitor(p_id uuid, p_username text)
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
CREATE OR REPLACE FUNCTION public.free_usernames(p_candidates text[])
RETURNS SETOF text
LANGUAGE sql
STABLE
AS $$
  SELECT c
    FROM unnest(p_candidates) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM visitors v WHERE public.search_normalize(v.username) = public.search_normalize(c));
$$;

REVOKE EXECUTE ON FUNCTION public.rename_visitor(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.free_usernames(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_visitor(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.free_usernames(text[]) TO service_role;

-- The API (PostgREST) caches the schema: without this, it may keep answering "function not found"
-- for a while.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- Before applying, if in doubt — names that would clash once normalized (must return nothing):
--   SELECT public.search_normalize(username), array_agg(username) FROM visitors
--    GROUP BY 1 HAVING count(*) > 1;
--
-- The index is the normalized one:
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'visitors_username_key';
--   -- … USING btree (search_normalize(username))
--
-- Renaming — rolled back, nothing stays:
--   BEGIN;
--   SELECT ensure_visitor('00000000-0000-4000-8000-000000000001', 'hasty:prop:042');
--   SELECT ensure_visitor('00000000-0000-4000-8000-000000000002', 'shy:winger:001');
--   SELECT rename_visitor('00000000-0000-4000-8000-000000000001', 'Dupont');          -- renamed
--   SELECT rename_visitor('00000000-0000-4000-8000-000000000001', 'DUPONT');          -- renamed (itself)
--   SELECT rename_visitor('00000000-0000-4000-8000-000000000002', 'Dupönt');          -- taken
--   SELECT rename_visitor('00000000-0000-4000-8000-000000000003', 'Zidane');          -- unknown
--   SELECT * FROM free_usernames(ARRAY['dupont', 'Dupont7']);                         -- Dupont7
--   ROLLBACK;
--
-- Then rename from the menu of the live site.
