-- Undoes 008_search_normalization.sql, back to the 006/007 state.
--
-- Destructive for one thing only: `club_aliases` and everything 009 seeded into it. The
-- seed is reproducible from 009_seed_club_aliases.sql, so nothing is lost that cannot be
-- replayed — but any alias curated after the seed is gone. Dump it first if that matters:
--   SELECT club_id, sport, alias, source FROM club_aliases ORDER BY sport, alias;
--
-- The generated `search_name` columns drop with no data loss: they are derived from
-- `name`, which is untouched.
--
-- Deploy the previous application code BEFORE running this — the repositories call
-- search_players / search_clubs, and they disappear here.

BEGIN;

DROP FUNCTION IF EXISTS public.search_clubs(text, text, int);
DROP FUNCTION IF EXISTS public.search_players(text, text, int);

DROP TABLE IF EXISTS club_aliases;

DROP INDEX IF EXISTS players_search_name_trgm_idx;
DROP INDEX IF EXISTS clubs_search_name_trgm_idx;

ALTER TABLE players DROP COLUMN IF EXISTS search_name;
ALTER TABLE clubs   DROP COLUMN IF EXISTS search_name;

-- Restore the indexes 008 dropped, exactly as 006 created them — including the composite
-- shape 008 replaced. They match the `ilike('name', …)` the old code goes back to.
CREATE INDEX players_sport_name_trgm_idx ON players USING gin (sport, name gin_trgm_ops);
CREATE INDEX clubs_sport_name_trgm_idx   ON clubs   USING gin (sport, name gin_trgm_ops);

DROP FUNCTION IF EXISTS public.search_normalize(text);
DROP FUNCTION IF EXISTS public.immutable_unaccent(text);

-- `unaccent` itself is left installed: dropping an extension another migration may later
-- want back is not worth the churn, and it costs nothing idle.

COMMIT;
