-- Seeds `club_aliases` (created by 008) with the rugby aliases people actually type.
--
-- Most of these are not new knowledge: they were curated by hand for the rugby import and
-- have been sitting in scripts/rugby/lib/clubsIndex.ts (`ALIASES`), used only at seed time
-- to reconcile allrugby.com's short names against clubs.csv. This migration moves that
-- knowledge into the database so the player's typeahead benefits from it too. The rest are
-- the everyday short forms and initialisms a French rugby follower uses (UBB, MHR, RCT).
--
-- Clubs are resolved BY NAME, not by hard-coded id: ids are import-generated UUIDs and
-- differ per environment. Resolution goes through `search_normalize`, so an accent drift
-- between this file and the row ("Bordeaux Bègles" vs "Bordeaux Begles") still matches.
--
-- Rows whose club is absent or renamed resolve to nothing and are silently skipped — RUN
-- THE UNRESOLVED-ALIASES CHECK AT THE BOTTOM after applying, and fix the pairs it lists.
--
-- Requires 008_search_normalization.sql. Safe to re-run: ON CONFLICT DO NOTHING.

BEGIN;

INSERT INTO club_aliases (club_id, sport, alias, source)
SELECT c.id, c.sport, v.alias, 'seed:009'
FROM (VALUES
  -- ── Top 14 / Pro D2: the city or the initialism, never the official name ──
  ('La Rochelle',        'Stade Rochelais'),
  ('Toulouse',           'Stade Toulousain'),
  ('Clermont',           'ASM Clermont'),
  ('ASM',                'ASM Clermont'),
  ('Toulon',             'RC Toulon'),
  ('RCT',                'RC Toulon'),
  ('Bordeaux',           'Union Bordeaux Bègles'),
  ('UBB',                'Union Bordeaux Bègles'),
  ('Montpellier',        'Montpellier Hérault Rugby'),
  ('MHR',                'Montpellier Hérault Rugby'),
  ('Castres',            'Castres Olympique'),
  ('CO',                 'Castres Olympique'),
  ('Pau',                'Section Paloise'),
  ('Perpignan',          'USA Perpignan'),
  ('USAP',               'USA Perpignan'),
  ('Bayonne',            'Aviron Bayonnais'),
  ('Lyon',               'Lyon OU'),
  ('LOU',                'Lyon OU'),
  ('Paris',              'Stade Français Paris'),
  ('Stade Français',     'Stade Français Paris'),
  ('Vannes',             'RC Vannes'),
  ('Agen',               'SU Agen'),
  ('SUA',                'SU Agen'),
  ('Aix',                'Provence Rugby'),
  ('Aix-en-Provence',    'Provence Rugby'),
  ('Aurillac',           'Stade Aurillacois'),
  ('Béziers',            'AS Béziers Hérault'),
  ('Biarritz',           'Biarritz Olympique PB'),
  ('BO',                 'Biarritz Olympique PB'),
  ('Brive',              'CA Brive'),
  ('CAB',                'CA Brive'),
  ('Narbonne',           'RC Narbonnais'),
  ('Nice',               'Nissa Rugby'),
  ('Carcassonne',        'US Carcassonne'),
  ('Mont-de-Marsan',     'Stade Montois Rugby'),
  ('Stade Montois',      'Stade Montois Rugby'),

  -- ── Foreign clubs, mostly the French exonym or the bare nickname ──
  ('Édimbourg',          'Edinburgh Rugby'),
  ('Edinburgh',          'Edinburgh Rugby'),
  ('Sharks',             'Sharks Durban'),
  ('Durban',             'Sharks Durban'),
  ('Sale',               'Sale Sharks'),
  ('Chiefs',             'Waikato Chiefs'),
  ('Waikato',            'Waikato Chiefs'),
  ('Trévise',            'Benetton Rugby Treviso'),
  ('Treviso',            'Benetton Rugby Treviso'),
  ('Benetton',           'Benetton Rugby Treviso'),
  ('Harlequins',         'Harlequin Football Club'),
  ('Quins',              'Harlequin Football Club')
) AS v(alias, club_name)
JOIN clubs c
  ON c.sport = 'rugby'
 AND c.search_name = public.search_normalize(v.club_name)
ON CONFLICT (club_id, alias) DO NOTHING;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
--
-- 1. Unresolved pairs — every row this returns is an alias that landed nowhere, because
--    the club is missing from this environment or has been renamed. Expect 0 rows.
--
--   SELECT v.alias, v.club_name
--   FROM (VALUES
--     ('La Rochelle','Stade Rochelais') /* …repeat the VALUES list above… */
--   ) AS v(alias, club_name)
--   WHERE NOT EXISTS (
--     SELECT 1 FROM clubs c
--     WHERE c.sport = 'rugby' AND c.search_name = public.search_normalize(v.club_name)
--   );
--
-- 2. Ambiguity — one normalized alias pointing at two different clubs in the same sport
--    would make the dropdown misleading. Expect 0 rows.
--
--   SELECT search_alias, sport, count(DISTINCT club_id)
--   FROM club_aliases GROUP BY search_alias, sport HAVING count(DISTINCT club_id) > 1;
--
-- 3. The case that started this:
--
--   SELECT id, name, matched_alias FROM public.search_clubs('rugby', 'la r');
--   -- → Stade Rochelais, matched_alias = 'La Rochelle'
--
-- 4. Coverage, for docs/spikes/club-aliases.md:
--
--   SELECT sport, count(*) FILTER (WHERE a.club_id IS NOT NULL) AS with_alias, count(*) AS total
--   FROM clubs c LEFT JOIN (SELECT DISTINCT club_id FROM club_aliases) a ON a.club_id = c.id
--   GROUP BY sport;
