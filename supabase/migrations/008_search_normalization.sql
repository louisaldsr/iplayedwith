-- Makes the typeahead forgiving: accents, apostrophes and hyphens stop being mandatory,
-- and a club can be found by the name people actually use ("La Rochelle") rather than
-- only by its official one ("Stade Rochelais").
--
-- Before this, search was `ILIKE '%q%'` on the raw `name`, so "gael fickou" missed
-- "Gaël Fickou", "saint etienne" missed "Saint-Étienne", and no spelling of "la rochelle"
-- reached the Stade Rochelais.
--
-- The rule (see `search_normalize` below): lowercase, strip diacritics, then DROP every
-- non-alphanumeric character — spaces included. Dropping separators rather than
-- collapsing them to a space is what solves both punctuation cases with one rule:
-- "saintetienne" == "saint etienne" == "saint-etienne", and "oconnor" finds "O'Connor".
-- The cost is that word boundaries are gone, so relevance ranking leans on pg_trgm's
-- `similarity()` instead of a word-prefix test.
--
-- Depends on 006_sport_space.sql (composite unique keys, pg_trgm, btree_gin) and 007.
--
-- Apply as ONE transaction in the Supabase SQL editor (there is no migration runner in
-- this repo), then run 009_seed_club_aliases.sql. Rollback: 008_search_normalization_rollback.sql.

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

-- `unaccent(text)` is only STABLE — it resolves the dictionary through `search_path` —
-- and a generated column requires IMMUTABLE. Pinning the dictionary by `regdictionary`
-- removes that dependency, which is what makes this wrapper honest.
--
-- Caveat to remember: if the unaccent dictionary file is ever replaced, the stored values
-- and the trigram indexes below go stale and need a REINDEX / column rebuild.
--
-- Preferred over a hand-rolled translate() because unaccent handles the multi-character
-- folds the football dataset is full of: ß→ss, æ→ae, œ→oe, ø→o, đ→d, ł→l.
CREATE FUNCTION public.immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Mirrored in TypeScript by src/lib/searchNormalize.ts. The two must agree: the browser
-- uses it to decide whether what was typed matches a returned suggestion.
CREATE FUNCTION public.search_normalize(txt text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS
$$ SELECT regexp_replace(lower(public.immutable_unaccent(txt)), '[^a-z0-9]+', '', 'g') $$;

-- ─── Normalized search columns ────────────────────────────────────────────────

ALTER TABLE players ADD COLUMN search_name text
  GENERATED ALWAYS AS (public.search_normalize(name)) STORED;
ALTER TABLE clubs   ADD COLUMN search_name text
  GENERATED ALWAYS AS (public.search_normalize(name)) STORED;

-- 006's trigram indexes were on the raw `name`, which nothing searches any more.
DROP INDEX IF EXISTS players_sport_name_trgm_idx;
DROP INDEX IF EXISTS clubs_sport_name_trgm_idx;

-- Trigram-only, NOT the multicolumn `gin (sport, … gin_trgm_ops)` shape 006 used.
--
-- Measured on 20k players: the composite index is usable but the planner never picks it,
-- and falls back to a sequential scan (6.5 ms) — because `sport` has two distinct values,
-- so its GIN posting list is half the table and the scan is priced accordingly. Dropping
-- `sport` out of the index gets it chosen (4.8 ms on a common query, 2.2 ms on a rare
-- one), with `sport` applied as a heap recheck against a bitmap that is already small.
-- The plain btree on `players (sport)` from 002 remains for everything else.
CREATE INDEX players_search_name_trgm_idx ON players USING gin (search_name gin_trgm_ops);
CREATE INDEX clubs_search_name_trgm_idx   ON clubs   USING gin (search_name gin_trgm_ops);

-- ─── Club aliases ─────────────────────────────────────────────────────────────

-- The names people type but no dataset carries: "La Rochelle" for Stade Rochelais,
-- "UBB" for Union Bordeaux-Bègles. Seeded by 009 from the alias map that was already
-- curated by hand for the rugby import (scripts/rugby/lib/clubsIndex.ts).
--
-- The composite FK on (club_id, sport) leans on `clubs_id_sport_key` from 006, so this
-- table inherits the sport-space invariant instead of restating it.
CREATE TABLE club_aliases (
  club_id      text NOT NULL,
  sport        text NOT NULL,
  alias        text NOT NULL,
  search_alias text GENERATED ALWAYS AS (public.search_normalize(alias)) STORED,
  -- Where the alias came from, so a rule-derived or imported batch can be re-run or
  -- rolled back without touching hand-curated rows.
  source       text NOT NULL DEFAULT 'manual',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, alias),
  CONSTRAINT club_aliases_sport_check CHECK (sport IN ('rugby', 'football')),
  CONSTRAINT club_aliases_club_sport_fkey
    FOREIGN KEY (club_id, sport) REFERENCES clubs (id, sport)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Trigram-only for the same reason as above.
CREATE INDEX club_aliases_search_alias_trgm_idx
  ON club_aliases USING gin (search_alias gin_trgm_ops);
CREATE INDEX club_aliases_sport_idx ON club_aliases (sport);

ALTER TABLE club_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read club_aliases" ON club_aliases FOR SELECT USING (true);

GRANT SELECT ON club_aliases TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON club_aliases TO service_role;

-- ─── Search functions ─────────────────────────────────────────────────────────

-- Called from the repositories with supabase.rpc(). The PostgREST query builder cannot
-- express either half of what these do: the union of club names with their aliases, or
-- an ORDER BY computed from the query string.
--
-- SECURITY INVOKER (the default) so RLS still applies; the `USING (true)` read policies
-- from 001 are what let anon call them.
--
-- LIKE, not ILIKE: `search_name` is already lowercase, and a plain LIKE is the form the
-- gin_trgm_ops index can serve. Note the index only helps from 3 non-wildcard characters
-- up; at the hook's 2-character minimum this is a sequential scan over ~11k rows, which
-- is fast enough to leave alone.
--
-- User-supplied `%` and `_` need no escaping here — search_normalize strips them, which
-- closes the hole the old `'%' || query || '%'` interpolation left open.

CREATE FUNCTION public.search_players(p_sport text, p_q text, p_limit int DEFAULT 20)
RETURNS TABLE (id text, name text, sport text, nationality text)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  WITH q AS (SELECT public.search_normalize(p_q) AS n)
  SELECT p.id, p.name, p.sport, p.nationality
  FROM players p, q
  WHERE p.sport = p_sport
    AND q.n <> ''
    AND p.search_name LIKE '%' || q.n || '%'
  ORDER BY
    (p.search_name = q.n) DESC,             -- exact match first
    (p.search_name LIKE q.n || '%') DESC,   -- then prefix
    similarity(p.search_name, q.n) DESC,
    p.name
  LIMIT least(greatest(p_limit, 1), 20);
$$;

-- `matched_alias` is NULL when the official name is what matched, and carries the alias
-- otherwise, so the dropdown can show "Stade Rochelais · La Rochelle" and the caller can
-- tell why a row is in the list.
CREATE FUNCTION public.search_clubs(p_sport text, p_q text, p_limit int DEFAULT 20)
RETURNS TABLE (id text, name text, sport text, logo_url text, matched_alias text)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  WITH q AS (SELECT public.search_normalize(p_q) AS n),
  hits AS (
    SELECT c.id, c.name, c.sport, c.logo_url,
           NULL::text AS matched_alias,
           c.search_name AS haystack
    FROM clubs c, q
    WHERE c.sport = p_sport AND q.n <> '' AND c.search_name LIKE '%' || q.n || '%'
    UNION ALL
    SELECT c.id, c.name, c.sport, c.logo_url,
           a.alias AS matched_alias,
           a.search_alias AS haystack
    FROM club_aliases a
    JOIN clubs c ON c.id = a.club_id AND c.sport = a.sport
    CROSS JOIN q
    WHERE a.sport = p_sport AND q.n <> '' AND a.search_alias LIKE '%' || q.n || '%'
  ),
  -- One row per club: a club matched by both its name and an alias keeps whichever hit
  -- scores better, so `matched_alias` stays NULL when the official name is the reason.
  best AS (
    SELECT DISTINCT ON (h.id)
           h.id, h.name, h.sport, h.logo_url, h.matched_alias,
           (h.haystack = q.n) AS is_exact,
           (h.haystack LIKE q.n || '%') AS is_prefix,
           similarity(h.haystack, q.n) AS sim
    FROM hits h, q
    ORDER BY h.id,
             (h.haystack = q.n) DESC,
             (h.haystack LIKE q.n || '%') DESC,
             similarity(h.haystack, q.n) DESC
  )
  SELECT best.id, best.name, best.sport, best.logo_url, best.matched_alias
  FROM best
  ORDER BY best.is_exact DESC, best.is_prefix DESC, best.sim DESC, best.name
  LIMIT least(greatest(p_limit, 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.search_players(text, text, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_clubs(text, text, int)   TO anon, authenticated, service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
-- SELECT public.search_normalize('Gaël Fickou');            -- → gaelfickou
-- SELECT public.search_normalize('AS Saint-Étienne');       -- → assaintetienne
-- SELECT public.search_normalize(E'Pat O\'Connor');         -- → patoconnor
-- SELECT count(*) FROM players WHERE search_name IS NULL;   -- → 0
-- SELECT * FROM public.search_players('rugby', 'gael fickou');
--
-- ANALYZE players; ANALYZE clubs;   -- the new columns have no statistics until this runs
-- EXPLAIN ANALYZE SELECT * FROM public.search_players('rugby', 'fickou');
--   -- expect a Bitmap Index Scan on players_search_name_trgm_idx, not a Seq Scan
