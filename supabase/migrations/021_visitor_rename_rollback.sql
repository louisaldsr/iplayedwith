-- Undoes 021_visitor_rename.sql: no renaming, and usernames unique as typed again.
--
-- Typed usernames already stored stay as they are. The index swap cannot fail: names unique once
-- normalized are unique as typed too.
--
-- The deployed app then answers 500 to every rename; deploy a build without it first.

BEGIN;

DROP FUNCTION IF EXISTS public.rename_visitor(uuid, text);
DROP FUNCTION IF EXISTS public.free_usernames(text[]);
REVOKE UPDATE (username) ON visitors FROM service_role;

DROP INDEX IF EXISTS visitors_username_key;
CREATE UNIQUE INDEX visitors_username_key ON visitors (username);

NOTIFY pgrst, 'reload schema';

COMMIT;
