-- Donne à chaque joueur une notoriété — `fame` : « quelle chance l'utilisateur a-t-il de le
-- connaître ». Trois usages à venir s'appuient dessus : tirer le random dans une bande de fame,
-- construire le daily challenge, et compter les points (joueur peu connu = plus de points).
--
-- Avant ça, rien dans `players` n'exprimait l'importance d'un joueur, et `findRandom`
-- (src/repositories/playersRepository.ts) tirait uniformément sur toute la table — une partie
-- pouvait donc opposer deux inconnus parmi 7 823 joueurs de rugby ou 11 455 de football.
--
-- ─── Pourquoi un score ABSOLU, et pas un rang centile ───
--
-- Une première version classait les joueurs par `percent_rank()`. Deux défauts rédhibitoires :
--
-- 1. Le score dépendait de la COHORTE, pas du joueur. Les données sont rafraîchies en bloc
--    (une fois par an en fin de saison, ou plus souvent) : ajouter 500 jeunes joueurs déplaçait
--    le score de tout le monde alors qu'aucune carrière n'avait changé. Un daily challenge
--    n'était plus reproductible, et la valeur en points d'un joueur bougeait pour des raisons
--    qui ne le concernaient pas.
-- 2. Le centile écrasait la magnitude. 68 % des joueurs sont à 0 sélection, donc tous à égalité
--    au centile 0 ; repondérer les sélections de 0.30 à 0.50 ne déplaçait Antoine Dupont que de
--    0,6 point (mesuré).
--
-- Ici `fame` ne dépend que des chiffres du joueur lui-même. Corriger un joueur à la main ne
-- déplace le score de personne d'autre, et un rafraîchissement partiel est sûr.
--
-- ─── Pourquoi une COLONNE GÉNÉRÉE ───
--
-- Conséquence directe du choix ci-dessus : un score absolu est calculable ligne à ligne, donc
-- Postgres peut s'en charger. Écrire `fame_details` recalcule `fame` dans la même instruction.
-- Il n'y a plus d'étape de recalcul à oublier, plus d'ordre à respecter, plus de « est-ce que
-- le recompute a tourné ? ». Le repo utilise déjà ce motif (`search_name GENERATED ALWAYS AS
-- (search_normalize(name)) STORED`, migration 008), donc la contrainte IMMUTABLE est éprouvée.
--
-- Contrepartie : changer la formule ne recalcule PAS les valeurs déjà stockées. Il faut
-- DROP la colonne, remplacer la fonction, puis la recréer — voir les notes en bas de fichier.
--
-- ─── La formule ───
--
--   fame = round(100 × [ 0.35·s(gamesPlayed, Kg) + 0.45·s(caps, Kc) + 0.20·s(gamesPlayed/seasons, Ki) ])
--   s(x, K) = min(1, sqrt(x / K))
--
-- `s` donne des RENDEMENTS DÉCROISSANTS : avec Kg=300, les 40 premiers matchs rapportent 0.37,
-- et les 160 suivants seulement 0.45 de plus. C'est voulu — passer de 0 à 40 matchs fait
-- basculer d'inconnu à « déjà vu jouer », passer de 250 à 290 ne change rien. Le logarithme
-- faisait la même chose trop fort (0.65 pour 40 matchs) : un remplaçant n'est pas aux deux
-- tiers de la célébrité d'un international.
--
-- Les poids sont des A PRIORI, pas un ajustement statistique : il n'existe aucune vérité
-- terrain « ce joueur est connu à 82 % » dans les données. Les sélections dominent parce
-- qu'elles sont le marqueur d'être connu HORS de son club. Le volume de matchs suit, mais ne
-- suffit pas (Dani Parejo : 616 matchs, 4 sélections). Le jour où le signal `appearance`
-- existera — combien de fois un joueur est cherché par les utilisateurs — il y aura enfin des
-- étiquettes, et les poids pourront être ajustés au lieu d'être choisis.
--
-- ─── Pourquoi `seasons` n'est PAS un terme additif ───
--
-- Mesuré sur les 11 455 joueurs de football : corr(games, seasons) = 0.933. Quasi-redondant —
-- l'ajouter comme terme positif reviendrait à recompter les matchs. Mais `games / seasons`
-- (l'intensité : titulaire ou rotation ?) est un vrai signal indépendant. À nombre de matchs
-- égal, le quartile le plus intense a 1,8 à 2,5 fois plus de sélections que le moins intense,
-- et c'est monotone sur les trois bandes testées. D'où son rôle de DIVISEUR.
--
-- `clubs` a été testé et écarté : à volume égal, les sélections moyennes montent jusqu'à 2-3
-- clubs puis redescendent franchement à 5+ (31.3 / 37.4 / 37.9 / 35.5 / 27.5). Les deux effets
-- — « connu de plusieurs publics » et « journeyman qui ne s'impose pas » — se neutralisent.
--
-- Dépend de 006_sport_space.sql (memberships.sport) et 008.
--
-- Appliquer comme UNE transaction dans l'éditeur SQL Supabase (il n'y a pas de migration
-- runner dans ce repo), puis lancer les seeds (voir bas de fichier).
-- Rollback : 010_player_fame_rollback.sql.

BEGIN;

-- ─── Le calcul ────────────────────────────────────────────────────────────────

-- IMMUTABLE est obligatoire : sans ça, Postgres refuse la colonne générée plus bas.
--
-- Les constantes K sont EN DUR et par sport. En dur parce qu'une colonne générée ne peut pas
-- lire une autre table — ce n'est pas une préférence, c'est la contrainte. Par sport parce que
-- le rugby compte la carrière entière et le football seulement le Big-5 depuis 2012 : ce ne
-- sont pas les mêmes univers, donc pas les mêmes plafonds.
--
-- Calibrage (à revérifier quand une saison de plus déplace les plafonds) :
--   Kg  football p99=438, max=665 (Lewandowski) · rugby top observé ~312
--   Kc  football p99=100, max=233 (Ronaldo)     · rugby max 115 (Ford)
--   Ki  football haut quartile ~39 matchs/saison · rugby ~22-26 chez les titulaires
--
-- Un sport inconnu donne des K nuls, donc `fame` NULL — visible dans le rapport, plutôt que
-- des chiffres silencieusement faux calculés avec les constantes d'un autre sport.
--
-- Lecture défensive des clés (`jsonb_typeof(...) = 'number'`) : le sac est ouvert et écrit par
-- des scripts, donc une clé absente ou mal typée vaut 0 au lieu de faire échouer tout un lot.
CREATE FUNCTION public.compute_fame(p_details jsonb, p_sport text)
RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  WITH raw AS (
    SELECT
      CASE WHEN jsonb_typeof(p_details -> 'gamesPlayed') = 'number'
           THEN greatest((p_details ->> 'gamesPlayed')::numeric, 0) END AS games,
      CASE WHEN jsonb_typeof(p_details -> 'caps') = 'number'
           THEN greatest((p_details ->> 'caps')::numeric, 0) END        AS caps,
      CASE WHEN jsonb_typeof(p_details -> 'seasons') = 'number'
           THEN greatest((p_details ->> 'seasons')::numeric, 0) END     AS seasons
  ),
  k AS (
    SELECT
      CASE p_sport WHEN 'rugby' THEN 300 WHEN 'football' THEN 600 END AS kg,
      CASE p_sport WHEN 'rugby' THEN 100 WHEN 'football' THEN 180 END AS kc,
      CASE p_sport WHEN 'rugby' THEN  28 WHEN 'football' THEN  45 END AS ki
  )
  SELECT CASE
    -- Sport inconnu → K nuls → NULL, explicitement. Ce test ne peut PAS être laissé à la
    -- propagation des NULL : `least(1, NULL)` vaut 1 en Postgres (least/greatest ignorent les
    -- NULL), donc les trois termes plafonneraient à 1 et un sport non calibré sortirait à
    -- fame = 100 au lieu de NULL. Vérifié : c'était le comportement avant ce garde-fou.
    WHEN k.kg IS NULL THEN NULL
    -- NULL = jamais importé, à distinguer de 0 = calculé et tout en bas. `seasons` seul ne
    -- compte pas : il est dérivé des memberships par refresh_fame_seasons() et serait donc
    -- présent même pour un joueur dont aucun import n'a jamais lu la carrière.
    WHEN raw.games IS NULL AND raw.caps IS NULL THEN NULL
    ELSE round(
      100 * (
          0.35 * least(1, sqrt(coalesce(raw.games, 0) / k.kg))
        + 0.45 * least(1, sqrt(coalesce(raw.caps, 0) / k.kc))
        + 0.20 * CASE
                   WHEN coalesce(raw.seasons, 0) > 0
                   THEN least(1, sqrt((coalesce(raw.games, 0) / raw.seasons) / k.ki))
                   ELSE 0
                 END
      )
    )::integer
  END
  FROM raw, k;
$$;

-- ─── Les colonnes ─────────────────────────────────────────────────────────────

ALTER TABLE players
  ADD COLUMN fame_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN fame integer GENERATED ALWAYS AS (public.compute_fame(fame_details, sport)) STORED;

-- Redondant avec la formule, qui ne peut pas sortir de 0..100 — gardé comme documentation
-- exécutable : si un jour quelqu'un change les poids sans qu'ils somment à 1, ça casse ici.
ALTER TABLE players
  ADD CONSTRAINT players_fame_range_check
  CHECK (fame IS NULL OR (fame >= 0 AND fame <= 100));

-- (sport, fame) et non (fame) seul : toute lecture du score est filtrée par sport, et le sport
-- en position de préfixe découpe l'index en deux plages contiguës. À l'inverse des index
-- trigrammes de 008, un btree multicolonne est ici le bon outil.
CREATE INDEX players_sport_fame_idx ON players (sport, fame);

-- ─── Écriture des signaux ─────────────────────────────────────────────────────

-- Appelée par les scripts d'import avec supabase.rpc(), par lots.
--
-- Un RPC et non un `upsert` sur `players` : un upsert exigerait de renvoyer `name` et `sport`
-- à chaque ligne, et écraserait donc l'identité du joueur avec ce que le script croit savoir.
--
-- La fusion se fait par `||` et non par affectation : les clés que l'appelant ne connaît pas
-- (un signal ajouté plus tard par un autre script) survivent à son écriture.
--
-- `p_rows` : [{"player_id": "...", "details": {"gamesPlayed": 250, "caps": 99, ...}}, ...]
CREATE FUNCTION public.apply_fame_details(p_sport text, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE players p
  SET fame_details = p.fame_details || r.details
  FROM jsonb_to_recordset(p_rows) AS r(player_id text, details jsonb)
  WHERE p.id = r.player_id
    AND p.sport = p_sport;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

-- `seasons` est dérivé des memberships, jamais écrit par un import : c'est exactement la donnée
-- dont le jeu construit son graphe, donc elle ne peut pas diverger, et ce rafraîchissement
-- rattrape un changement de memberships sans relancer un scraper.
--
-- Une étape explicite plutôt qu'un trigger sur `memberships` : un import écrit 41 424 lignes,
-- et ce repo a déjà retiré exactement ce genre de trigger pour cette raison (migration 007).
--
-- LEFT JOIN pour que les joueurs sans aucun membership reçoivent bien `seasons: 0` plutôt que
-- de garder une valeur périmée d'un passage précédent.
CREATE FUNCTION public.refresh_fame_seasons(p_sport text)
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE players p
  SET fame_details = p.fame_details || jsonb_build_object('seasons', s.season_count)
  FROM (
    SELECT p2.id, count(DISTINCT m.season) AS season_count
    FROM players p2
    LEFT JOIN memberships m
      ON m.player_id = p2.id
     AND m.sport = p2.sport
    WHERE p2.sport = p_sport
    GROUP BY p2.id
  ) s
  WHERE p.id = s.id
    AND p.sport = p_sport;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

-- Ces deux fonctions ÉCRIVENT : seul l'import (service_role) les appelle. `compute_fame` est
-- appelée par la colonne générée, pas par un client, et n'a donc besoin d'aucun GRANT.
-- La lecture des colonnes est déjà couverte par la policy « public read players » de 001.
GRANT EXECUTE ON FUNCTION public.apply_fame_details(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_fame_seasons(text)      TO service_role;

COMMIT;

-- ─── Post-apply checks ────────────────────────────────────────────────────────
-- Juste après l'application, avant tout seed :
-- SELECT count(*) FROM players WHERE fame IS NOT NULL;              -- → 0
-- SELECT to_regproc('public.compute_fame');                         -- → non NULL
--
-- La formule, sans toucher à la table (les chiffres sont ceux mesurés sur les vrais profils) :
-- SELECT public.compute_fame('{"gamesPlayed":250,"caps":99,"seasons":13}'::jsonb, 'rugby');     -- → 95
-- SELECT public.compute_fame('{"gamesPlayed":211,"caps":64,"seasons":13}'::jsonb, 'rugby');     -- → Dupont
-- SELECT public.compute_fame('{"gamesPlayed":665,"caps":167,"seasons":14}'::jsonb, 'football'); -- → Lewandowski
-- SELECT public.compute_fame('{"gamesPlayed":616,"caps":4,"seasons":14}'::jsonb, 'football');   -- → Parejo, bien plus bas
-- SELECT public.compute_fame('{"seasons":5}'::jsonb, 'rugby');                                  -- → NULL (jamais importé)
-- SELECT public.compute_fame('{"gamesPlayed":10,"caps":0,"seasons":0}'::jsonb, 'rugby');        -- → pas de division par zéro
-- SELECT public.compute_fame('{"gamesPlayed":250,"caps":99,"seasons":13}'::jsonb, 'basketball');-- → NULL, surtout pas 100
--
-- Puis, une fois les seeds passés (npm run seed:fame / seed:football:fame) :
-- SELECT count(*) FROM players WHERE sport = 'rugby' AND fame IS NULL;   -- → 0
-- SELECT min(fame), max(fame) FROM players WHERE sport = 'rugby';
--
-- Déciles : PAS uniformes, contrairement à la version centile — c'est attendu. Le bas est
-- forcément gros (beaucoup de joueurs d'une poignée de matchs sans sélection).
-- SELECT width_bucket(fame, 0, 100, 10) AS decile, count(*)
--   FROM players WHERE sport = 'football' GROUP BY 1 ORDER BY 1;
--
-- Le contrôle qui compte est nominatif — npm run fame:report -- --sport=rugby.
--
-- ANALYZE players;   -- les nouvelles colonnes n'ont aucune statistique avant ça
-- EXPLAIN ANALYZE SELECT id FROM players WHERE sport = 'rugby' AND fame BETWEEN 70 AND 90 LIMIT 20;
--   -- attendu : Index Scan sur players_sport_fame_idx, pas un Seq Scan
--
-- ─── Changer la formule plus tard ─────────────────────────────────────────────
--
-- ⚠️ Postgres N'EMPÊCHE PAS un `CREATE OR REPLACE FUNCTION public.compute_fame(...)` alors
-- qu'une colonne générée en dépend. Il l'accepte sans un mot, et le résultat est pire qu'un
-- refus — mesuré sur une base locale :
--
--   fame stocké = 93   |   ce que la nouvelle fonction renvoie = 0
--
-- Les valeurs déjà stockées ne sont PAS recalculées, mais toute ligne réécrite ensuite adopte
-- la nouvelle formule. La table part donc en état MIXTE : une partie des joueurs sur l'ancienne
-- formule, une partie sur la nouvelle, selon qu'ils ont été touchés ou non. Rien ne le signale.
--
-- Donc, pour changer la formule, TOUJOURS dans cet ordre :
--   ALTER TABLE players DROP COLUMN fame;              -- force le recalcul de toute la table
--   CREATE OR REPLACE FUNCTION public.compute_fame(...);
--   ALTER TABLE players ADD COLUMN fame integer
--     GENERATED ALWAYS AS (public.compute_fame(fame_details, sport)) STORED;
--   ALTER TABLE players ADD CONSTRAINT players_fame_range_check
--     CHECK (fame IS NULL OR (fame >= 0 AND fame <= 100));
--   CREATE INDEX players_sport_fame_idx ON players (sport, fame);
--
-- Le DROP n'est pas une précaution : c'est la seule chose qui garantit que les 11 k lignes
-- repassent par la nouvelle formule. Quelques secondes par sport.
