# I Played With — Brief Claude Code

## Contexte projet

Jeu web "Six Degrés de Séparation" appliqué au rugby.
- Deux joueurs tirés au sort : Joueur A et Joueur B
- But : relier A à B via des co-équipiers (même club, même saison)
- Graphe non orienté

**Stack : Next.js (TypeScript), React, PostgreSQL**

---

## Architecture des couches

```
BDD (PostgreSQL)
  → tables : players, clubs, memberships (données brutes, IDs string)
  → `sport` est un espace : porté par les 3 tables, indexé,
    invariant garanti par des FK composites (migration 006)

Domaine (TypeScript)
  → objets validés, IDs brandés, smart constructors

Game/Graph (règles côté serveur, graphe côté client)
  → GameNode, GameEdge ; le client détient son graphe (quelques nœuds)
  → les règles et les memberships vivent sur le serveur
  → jamais persisté côté serveur : aucune session, le client
    renvoie son graphe à chaque coup et le serveur le revalide
```

---

## ✅ Bloc 2 terminé — Couche domaine + Graph/Game

### Fichiers créés

```
src/
  domain/
    ids.ts          — PlayerId, ClubId (branded strings)
    season.ts       — Season validée (regex YYYY-YYYY + contrôle plage)
    player.ts       — Player { id: PlayerId, name }
    club.ts         — Club { id: ClubId, name }
    membership.ts   — Membership { playerId, clubId, season }
  graph/
    node.ts         — GameNode = PlayerNode | ClubNode
    edge.ts         — GameEdge { playerId, clubId, season }
  game/
    game.ts         — Game { playerA, playerB, difficulty, nodes, edges, startedAt }
  mock/
    data.ts         — 18 joueurs, 5 clubs (Top 14), memberships → chemins longueur 1 à 4
```

**Rappel** : `difficulty` vit dans `Game`, pas dans `GameEdge`. Un seul type d'edge quelle que soit la difficulté.

En mode Easy, l'user saisit uniquement des joueurs — le moteur résout le `Membership` commun.
En mode Hard, l'user saisit joueur + club + saison explicitement.

---

## ✅ Bloc 3 terminé — Moteur de jeu côté serveur

Le jeu chargeait tout le dataset du sport au montage (55 requêtes séquentielles,
7,56 Mo, 5,4 s mesurés pour le football). Les règles vivent désormais sur le serveur
et le navigateur ne reçoit plus jamais les memberships.

### Découpage

```
src/game/
  userInput.ts    — UserInput (easy | hard-player | hard-club)
  moveRules.ts    — applyMove() : LA règle, partagée serveur + moteur mémoire
  path.ts         — bfsPlayerPath() : détection de victoire
  membershipIndex.ts / graphBuilder.ts — inchangés
  engine.ts       — moteur mémoire, désormais implémentation de référence (tests)
  remoteEngine.ts — pilote client : détient le graphe, POST chaque coup

src/services/moveService.ts — applyMove() côté serveur
```

**Point clé** : le serveur n'indexe que les memberships des joueurs du graphe
(+ celui soumis) — une requête indexée d'environ 150 lignes au lieu de 41 424.
Un coup ne peut jamais lire autre chose, ce qui rend cette tranche suffisante.

### Session sans état

Aucune table de session. Le client renvoie son graphe (quelques nœuds) à chaque
coup ; le serveur **revalide chaque arête** contre la base avant de s'en servir —
une arête forgée est rejetée. C'est ce qui rend le sans-état sûr.

### Endpoints du jeu

| Route | Rôle |
|---|---|
| `POST /api/:sport/move` | joue un coup, renvoie nœud + arêtes + victoire |
| `GET /api/players?sport=&q=` | recherche joueur (`q` obligatoire, 20 max) |
| `GET /api/clubs?sport=&q=` | recherche club (`q` obligatoire, 20 max) |
| `GET /api/clubs/:id/seasons` | saisons d'un club (chips mode hard) |
| `GET /api/players/random?sport=` | bouton « Randomize » |
| `POST /api/validate` | A et B ont-ils déjà joué ensemble (garde mode easy) |

`q` est **obligatoire** sur players/clubs : sans lui la route paginait toute la
table. Le chemin non borné reste disponible côté serveur pour les imports.

---

## ✅ Bloc 4 terminé — Recherche tolérante + alias de clubs

La recherche exigeait l'orthographe exacte : `gael fickou` ne trouvait pas `Gaël Fickou`,
`saint etienne` ne trouvait pas `Saint-Étienne`, et `la rochelle` ne trouvait rien du tout.

### La règle de normalisation

Minuscules → suppression des diacritiques → suppression de **tout** caractère non
alphanumérique, espaces compris. `"AS Saint-Étienne"` → `assaintetienne`.

Les séparateurs sont supprimés et non remplacés par un espace : c'est ce qui règle
l'accent et la ponctuation avec une seule règle (`saint etienne` == `saint-etienne`,
`oconnor` == `O'Connor`). Écrite deux fois — `public.search_normalize()` en SQL
(colonnes générées `players.search_name` / `clubs.search_name`, indexées en trigrammes) et
`src/lib/searchNormalize.ts` côté client pour la comparaison saisie ↔ suggestion. Un test
de parité verrouille les deux.

### Alias de clubs

Table `club_aliases` : « La Rochelle » → Stade Rochelais, « UBB » → Union Bordeaux-Bègles.
`search_clubs()` unit les correspondances nom + alias et renvoie `matchedAlias`, affiché en
hint dans le dropdown. Seed rugby dans `009`, repris de la curation qui dormait dans
`scripts/rugby/lib/clubsIndex.ts`. Sourcing à l'échelle : voir
[docs/spikes/club-aliases.md](docs/spikes/club-aliases.md).

### Pourquoi `.rpc()`

Premiers appels `.rpc()` du codebase (`search_players`, `search_clubs`). PostgREST ne sait
exprimer ni l'union nom + alias, ni un `ORDER BY` calculé depuis la requête (exact →
préfixe → `similarity()`).

---

## ✅ Bloc 5 terminé — Fame des joueurs (v1, premier jet)

`findRandom` tirait uniformément sur toute la table : une partie pouvait opposer deux
inconnus parmi 7 823 joueurs de rugby ou 11 455 de football. Chaque joueur porte désormais
une **fame**, 0..100, recalculée à chaque import.

> Le nom : *notoriety* en anglais est péjoratif (on est « notorious » pour une mauvaise
> raison) — faux ami du français *notoriété*. Le mot juste est **fame**.

### Stockage

```
player_fame (sport, player_id)   — 1 ligne par joueur (010)
  details        jsonb    — signaux importés que memberships ne porte pas : aujourd'hui `caps`
  score          integer  — la SORTIE, 0..100, NULL tant que non calculée
  revision       smallint — version de formule qui a produit le score
  last_update_at timestamptz
memberships.games  integer — matchs pour CE club, CETTE saison, toutes compétitions (011)
                             NULL = la source ne dit rien ; 0 = n'a pas joué
fame_calibration (sport, k_games, k_caps) — l'échelle de chaque source, en DONNÉES (012)
```

Les matchs vivent sur `memberships` pour qu'un total ne puisse jamais couvrir d'autres clubs
ou saisons que ceux du graphe. Plus de colonne générée : elle ne peut pas lire une autre table.

### La formule v1 — revision 1 (`012_fame_score.sql`)

```
score = round(100 × [ 0.55·s(caps, k_caps) + 0.45·s(games, k_games) ])
s(x, K) = min(1, √(x / K))
games = sum(memberships.games)   caps = details.caps   (absent → 0)
```

Volontairement simple : deux signaux, **absolu** (pas de centile — le score d'un joueur ne
dépend pas de la cohorte). `√` = rendements décroissants. Poids = a priori, pas un ajustement.
Le terme d'intensité (`games/seasons`) du spike est écarté de la v1.

`K` = seuil de saturation, **par sport en données** (rugby 300/100 : carrière entière ;
football 600/180 : Big-5 depuis 2012) — la formule, elle, ne branche jamais sur le sport.

`compute_fame_scores(sport)` réécrit **tout** le sport d'un coup (crée au passage une ligne
pour les joueurs sans signaux) : jamais d'état mixte. Refuse de tourner sans ligne de
calibration (piège `least(1, NULL) = 1` → score 100).

⚠️ **Changer la formule OU un K** : bumper `FAME_REVISION` dans la fonction, puis
`npm run fame:compute -- --sport=…`. `fame:report` signale toute ligne restée sur une
ancienne révision.

### Limite connue

Deux signaux cumulatifs : la fame suit la **longévité**, pas la célébrité (Atonio devant
Dupont, Mbappé 61ᵉ). Accepté pour un premier jet. Pistes : club fame, signal `appearance`.
Détail : [docs/spikes/fame.md](docs/spikes/fame.md).

### Ordre d'import

La fame vient **en dernier** : le score lit `memberships.games`.

```
rugby    : seed:map-players → seed:players → seed:memberships → seed:fame
football : seed:football:fetch → :build → :clubs → :players → :memberships → :fame
```

Les étapes `:fame` écrivent les caps **puis calculent les scores**. Après un changement de
formule seul : `npm run fame:compute -- --sport=rugby`. Contrôle :
`npm run fame:report -- --sport=rugby` — couverture, révision, déciles, top/bottom 30
**nominatif** (les déciles seuls ne distinguent pas un bon classement d'un mauvais).

### Formatage

Prettier est branché sur tout le projet (`npm run format`, `format:check`), configuré sur le
style existant : sans point-virgule, guillemets simples, `printWidth: 120` (mesuré — les lignes
du repo sont à p99=110).

---

## ✅ Bloc 6 terminé — Paliers de fame

Afficher le score brut (0..100) et donner un nombre de points différent par joueur serait
illisible : personne ne distingue un 47 d'un 52, et le score lui-même ordonne mal le haut du
classement. Le jeu lit donc un **palier**, jamais le score — `src/domain/fameFloor.ts`.

| palier | clé | EN / FR | score | rugby | football |
|---|---|---|---|---|---|
| 1 | `famous` | Famous / Célèbre | 70–100 | 186 (2,7 %) | 173 (1,5 %) |
| 2 | `known` | Known / Connu | 30–69 | 2 272 (33,1 %) | 2 143 (18,7 %) |
| 3 | `unsung` | Unsung / Méconnu | 0–29 | 4 397 (64,1 %) | 9 139 (79,8 %) |

- **Seuils absolus, pas des centiles** : le palier d'un joueur ne dépend que de sa carrière ;
  importer d'autres joueurs ne le déplace jamais (même raisonnement que pour le score).
- **Communs à tous les sports** : `fame_calibration` met déjà les sports sur la même échelle.
- **Rien n'est stocké** : dérivé de `player_fame.score` à la lecture. Changer un seuil = modifier
  `FAME_FLOORS` et ses tests, puis relire `fame:report` (section *Floors* : effectifs et joueurs
  nommés de part et d'autre de chaque seuil).
- Score NULL → **pas de palier** (`null`) : un joueur non calculé n'est pas un inconnu.
- `fameFloorRange(palier)` donne la plage de scores à filtrer : le SQL n'a pas à connaître les
  paliers (futur tirage par palier).
- « Unsung » (*unsung hero*) / « Méconnu » : affiché publiquement, le nom doit rester bienveillant
  envers les joueurs eux-mêmes. Libellés dans `src/i18n` (`fame.floors`).

Rien ne compte encore de points : un palier plus haut vaudra plus de points, plus tard.

**Dans l'UI** : `POST /api/:sport/move` renvoie le palier (`Player.fameFloor`, jamais le score)
du joueur ajouté ; la carte du graphe est stylée par palier, sauf pour A et B. Rareté inversée :
moins un joueur est connu, plus sa carte est spéciale — `famous` sobre, `known` teal, `unsung`
bordure holographique animée. La lecture de la fame est décorative : si elle échoue, le coup
passe quand même, sans palier.

---

## Flux de validation

```
Saisie user
  → [UI] autocomplétion serveur débouncée (confort UX, ne pré-résout rien)
  → [remoteEngine] POST /api/:sport/move avec le graphe courant
  → [serveur] revalide les arêtes soumises, applique moveRules, calcule le chemin
  → OK → le client ajoute le nœud et les arêtes renvoyés
  → KO → erreur « tentative erronée » affichée au user
```

---

## Prochaines étapes

1. ~~Créer les fichiers domaine~~
2. ~~Créer le mock data~~
3. ~~Écrire le GameEngine~~
4. ~~Brancher l'UI React~~
5. ~~Passer le moteur côté serveur + `sport` comme espace~~
6. ~~Appliquer `006_sport_space.sql` (audit → migration → déploiement → `007`)~~
7. ~~Recherche insensible aux accents/ponctuation + alias de clubs~~
8. Appliquer `008_search_normalization.sql` puis `009_seed_club_aliases.sql`
   (contrôles post-application en bas de chaque fichier — alias non résolus, ambiguïtés)
9. Trancher le sourcing des alias à l'échelle (rugby : 48/82 ; football : 0/176)
10. ~~Métrique de fame — signaux, `player_fame`, `memberships.games`, formule v1 (caps + matchs)~~
11. Appliquer `010` → `011` → `012_fame_score.sql`, relancer `:memberships` puis `:fame` des deux
    sports — et **lire le top/bottom 30** ; ajuster les K dans `fame_calibration` si besoin
12. ~~Paliers de fame (`famous` / `known` / `unsung`)~~
13. Brancher les paliers : tirage par palier sur `findRandom`, puis daily challenge, puis points par palier
14. Remonter `source` / `sourceUrl` dans `Player` (retirés du sac de fame) — permettrait aussi
    d'envoyer l'utilisateur vers la fiche d'origine du joueur depuis le jeu
15. Le signal `appearance` (combien de fois un joueur est cherché), quand le jeu produira des
    parties — c'est lui qui donnera enfin des étiquettes pour ajuster les poids de la fame