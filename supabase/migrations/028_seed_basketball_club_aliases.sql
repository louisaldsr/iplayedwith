-- Seeds `club_aliases` with the basketball short forms the club search cannot already find.
--
-- `search_clubs()` matches a SUBSTRING of the normalized name, so a team's nickname needs no
-- alias at all: "lakers" is inside "losangeleslakers", "blazers" inside "portlandtrailblazers",
-- "sonics" inside "seattlesupersonics". Same for most three-letter codes ("bos", "chi", "mia").
-- What is left are the forms that are NOT substrings of the name:
--
--   - the nicknames of nicknames: Sixers, Cavs, Mavs, Clips, Dubs, Pels, T-Wolves
--   - "LA" for Los Angeles
--   - the team codes that do not occur in the name: OKC, GSW, LAL, LAC, NYK, BKN, NOP, PHX, SAS
--
-- Team names are Basketball-Reference's, one club per name (see scripts/basketball/lib/dataset.ts).
-- Resolved BY NAME through `search_normalize`, as in 009: ids are import-generated UUIDs.
--
-- APPLY AFTER `npm run seed:basketball:clubs` — before it, every pair resolves to nothing and the
-- INSERT silently writes 0 rows. Then run the unresolved check at the bottom. Re-runnable.

BEGIN;

INSERT INTO club_aliases (club_id, sport, alias, source)
SELECT c.id, c.sport, v.alias, 'seed:028'
FROM (VALUES
  -- ── Nicknames of nicknames ──
  ('Sixers',     'Philadelphia 76ers'),
  ('Cavs',       'Cleveland Cavaliers'),
  ('Mavs',       'Dallas Mavericks'),
  ('Clips',      'Los Angeles Clippers'),
  ('Dubs',       'Golden State Warriors'),
  ('Pels',       'New Orleans Pelicans'),
  ('T-Wolves',   'Minnesota Timberwolves'),

  -- ── "LA" for Los Angeles ──
  ('LA Lakers',  'Los Angeles Lakers'),
  ('LA Clippers','Los Angeles Clippers'),

  -- ── Team codes absent from the name ──
  ('OKC',        'Oklahoma City Thunder'),
  ('GSW',        'Golden State Warriors'),
  ('LAL',        'Los Angeles Lakers'),
  ('LAC',        'Los Angeles Clippers'),
  ('NYK',        'New York Knicks'),
  ('BKN',        'Brooklyn Nets'),
  ('NOP',        'New Orleans Pelicans'),
  ('PHX',        'Phoenix Suns'),
  ('SAS',        'San Antonio Spurs')
) AS v(alias, club_name)
JOIN clubs c
  ON c.sport = 'basketball'
 AND c.search_name = public.search_normalize(v.club_name)
ON CONFLICT (club_id, alias) DO NOTHING;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- 1. Every pair landed. Expect 18:
--
--   SELECT count(*) FROM club_aliases WHERE source = 'seed:028';
--
--    Fewer means a club name drifted from Basketball-Reference's; list the clubs to compare:
--   SELECT name FROM clubs WHERE sport = 'basketball' ORDER BY name;
--
-- 2. No alias points at two clubs (same check as 009). Expect 0 rows:
--
--   SELECT search_alias, sport, count(DISTINCT club_id)
--   FROM club_aliases GROUP BY search_alias, sport HAVING count(DISTINCT club_id) > 1;
--
-- 3. The point of it:
--
--   SELECT name, matched_alias FROM public.search_clubs('basketball', 'sixers');
--   -- → Philadelphia 76ers, matched_alias = 'Sixers'
