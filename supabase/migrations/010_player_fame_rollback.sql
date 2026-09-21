-- Undoes 010_player_fame.sql, back to the 008/009 state.
--
-- Destructif pour les signaux : `fame_details` contient des données qu'un réimport complet seul
-- peut reconstruire — le `gamesPlayed`/`caps` rugby vient du reparsing de ~20 k profils en
-- cache, celui du football d'un passage sur 1,9 M lignes d'appearances. Ni l'un ni l'autre
-- n'est versionné. Les redescendre d'abord si ça compte :
--   SELECT id, sport, fame, fame_details FROM players WHERE fame_details <> '{}'::jsonb;
--
-- `fame` lui-même se perd sans regret : entièrement dérivé de `fame_details` et du sport, donc
-- réécrire les signaux le reconstruit à l'identique.
--
-- L'ordre compte : la colonne générée dépend de `compute_fame()`, donc elle tombe en premier.
-- `DROP FUNCTION` avant le `DROP COLUMN` échouerait sur une dépendance.
--
-- Rien à déployer avant : au moment où ce rollback est écrit, aucun chemin de lecture du jeu ne
-- touche ces colonnes (T1 s'arrête à la métrique). Si ce n'est plus vrai, déployer d'abord le
-- code qui ne les lit pas.

BEGIN;

DROP INDEX IF EXISTS players_sport_fame_idx;

ALTER TABLE players DROP CONSTRAINT IF EXISTS players_fame_range_check;

-- La colonne générée avant la fonction dont elle dépend.
ALTER TABLE players DROP COLUMN IF EXISTS fame;
ALTER TABLE players DROP COLUMN IF EXISTS fame_details;

DROP FUNCTION IF EXISTS public.refresh_fame_seasons(text);
DROP FUNCTION IF EXISTS public.apply_fame_details(text, jsonb);
DROP FUNCTION IF EXISTS public.compute_fame(jsonb, text);

COMMIT;
