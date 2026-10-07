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

### La formule v2 — revision 2 (`014_fame_rate.sql`)

```
score = round(100 × [ 0.40·s(caps, k_caps) + 0.25·s(games, k_games) + 0.35·s(rate, k_rate) ])
rate  = caps / greatest(seasons, 3)        k_rate : rugby 6, football 8
```

- **Caps seniors uniquement** (rugby) : le parseur comptait U20, A, XV, Barbarians, Māori,
  Développement — ~15 % des « caps », surtout chez les jeunes. `isSeniorNationalTeam()` dans
  `scripts/rugby/lib/playerProfileParser.ts` ; les Lions comptent.
- **Caps par saison** = talent/intensité, le premier signal non cumulatif. Caps et saisons étant
  coupés par le début des données (2012-2013), leur ratio résiste à cette coupure : un joueur à
  cheval (Dusautoir) garde un taux juste. Plancher de 3 saisons contre les taux extrêmes.
- Mesurés et **écartés** : la part de matchs dans l'équipe (récompense les piliers de club,
  pénalise les internationaux absents) et le prestige de club par les caps de l'effectif (classe
  en tête des viviers nationaux : Jaguares, Drua, franchises italiennes).
- La notoriété médiatique (Dupont derrière Kinghorn) n'est dans aucune donnée : spike Wikidata.

### La formule v3 — revision 3 : quatre piliers (`023` → `025`)

La v2 lisait caps, matchs et caps par saison : les caps pesaient plus de la moitié du score, donc
« performance » voulait dire « sélectionné par son pays ». Un cador du Top 14 peu capé (Jack Willis)
restait `known`, 22 sélections avec l'Espagne valaient 22 avec les All Blacks, et rien ne mesurait
ce que le public lit d'un joueur. La v3 a été conçue sur un **prototype des deux effectifs
complets**, jugé nominativement (top/bottom, joueurs de référence) avant d'écrire la migration.

```
score  = round(100 × [ 0.15·L + 0.20·P_club + 0.20·P_intl + 0.45·E ])
         sans correspondance Wikipedia (E inconnu) → (0.15·L + 0.20·P_club + 0.20·P_intl) / 0.55

L      = min(1, matchs en carrière / k_games)                                  longévité, linéaire
P_club = min(1, moyenne des 5 meilleures saisons (rôle × prestige/100) / k_club)
         rôle = part des TITULARISATIONS de l'effectif cette saison (minutes si la source n'a pas
         de titularisations) ; division par clamp(saisons, 3, 5)
P_intl = min(1, √( Σ caps × palier de la nation / max(saisons, 3) / k_rate ))
E      = clamp((log10(vues par an) − 2) / (log10(v_max) − 2))      vues Wikipedia fr + en, 3 ans
```

| | k_games | k_club | k_rate | v_max |
|---|---|---|---|---|
| rugby | 260 | 0,45 | 7,5 | 1 000 000 |
| football | 550 | 0,47 | 9,0 | 15 000 000 |

- **Par saison, pas cumulé** : seule la longévité est un total. Les piliers de performance cumulés
  écrasaient les jeunes stars (Yamal 68 avec 10,5 M de vues/an ; par saison, 85).
- **Titularisations, pas minutes**, quand la source les donne : piliers, talonneurs et demis de mêlée
  sortent vers l'heure de jeu, les minutes en faisaient des remplaçants. Football : minutes.
- **Paliers de nation** (`nation_tiers`) : rugby curé dans `025` (top 10 + Lions 1, Fidji/Samoa/Tonga/
  Géorgie/Japon 0,5, neuf suivantes 0,2, le reste 0,1) ; football écrit par l'import depuis le
  **classement FIFA du dataset** (top 10 / 11-30 / 31-60 / reste : 1 / 0,5 / 0,2 / 0,1). Dans un
  effectif de Pro D2, les caps bruts étaient corrélés **négativement** aux vues (−0,36).
- **Exposition = vues Wikipedia** françaises + anglaises, moyenne sur **36 mois** (60 jours suivaient
  l'actualité : Ma'a Nonu lu comme une star). Échelle log, 100 vues → 0.
- **Plafonds par sport, en données** : les mesures par saison saturent au p99 du sport, les vues au
  niveau de sa plus grande star — seule une poignée de stars complètes atteint 90+.
- **Club-saison** (`club_season_prestige`, `023`) : victoires européennes pondérées + titres de la
  saison + 30 % de la moyenne du club ; titres rugby curés dans `024` (2012-13 → 2025-26 ;
  le graphe rugby commence en fait en 2013-14 — `025` retire les 5 titres 2012-13 sans effectif),
  football dérivés des résultats.
- `compute_fame_scores` appelle `compute_season_prestige` d'abord, et écrit les **quatre piliers**
  (`player_fame.terms`) avec le score : `fame:report` les affiche.

### Correspondance Wikidata — jamais deviner

`fame:exposure` relie chaque joueur à son item Wikidata **par un identifiant partagé** : All.Rugby ID
(P9903, lu dans le lien `hreflang="en"` de chaque profil allrugby.com — il distingue les homonymes,
`tom-wood` / `tom-wood-`, ce que notre slug d'URL ne fait pas) ; Transfermarkt ID (P2446). Accents
ignorés (Wikidata stocke `aurélien-rougerie`). Repli **nom unique** pour les joueurs de rugby à
100+ matchs dont l'item n'a pas l'ID. Un ID partagé par deux de nos joueurs, un nom porté par deux
items, un item attribué à deux joueurs : aucune correspondance. Couverture mesurée : rugby 93-95 %
des joueurs à 100+ matchs (59 % au total — les inconnus n'ont pas d'article), football 98 %.

**User-Agent** : Wikimedia limite un client non identifié à 10 requêtes/min, un client dont le
User-Agent suit leur format à 200 — le même débit qu'un compte avec token, donc **aucun compte**. Le
premier essai sans ce format passait son temps en 429. Vues mises en cache dans
`scripts/input/wikipedia/` : une exécution interrompue reprend où elle était.

### Limite connue

La notoriété médiatique hors fr/en (Japon, Brésil…) n'est pas mesurée : la fame vise l'audience du
jeu. Le signal `appearance` (joueurs tapés dans le jeu) donnera enfin des étiquettes pour ajuster
les poids, choisis a priori. Le tirage du défi (019, bande 60-80) n'a pas bougé : 307 joueurs rugby
et 339 football dans la bande sur le prototype — à revoir avec les paliers.
Détail : [docs/spikes/fame.md](docs/spikes/fame.md).

### Ordre d'import

La fame vient **en dernier** : le score lit les memberships (matchs, titularisations, minutes), le
prestige des saisons et les vues.

```
rugby    : seed:map-players → seed:players → seed:memberships → seed:fame → seed:prestige → fame:exposure
football : seed:football:fetch → :build → :clubs → :players → :memberships → :fame → :prestige → fame:exposure
```

`seed:fame` écrit les caps (total et par nation), les titularisations/minutes et, en football, les
paliers FIFA ; `:prestige` les victoires continentales (et les titres football) ; `fame:exposure
-- --sport=…` la correspondance Wikidata et les vues (long : ~45 min rugby, ~2 h 30 football, en
cache ensuite). **Chacune recalcule** prestige et fame. Après un changement de formule ou de
plafond seul : `npm run fame:compute -- --sport=rugby`. Contrôles : `npm run prestige:report`, puis
`npm run fame:report -- --sport=…` — couverture (correspondance, exposition mesurée), révision,
déciles, top/bottom 30 **nominatif** avec les quatre piliers.

⚠️ `seed:football:fetch` télécharge à nouveau l'archive (une table de plus : `national_teams`), puis
`:build` doit être relancé avant `:fame` (minutes et sélections dans le dataset).

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

## ✅ Bloc 7 terminé — Daily Challenge

Le jeu change d'entrée : `/[sport]` ouvre le **défi du jour** — une paire par sport et par jour,
la même pour tout le monde. La partie libre (choisir A et B) passe en secondaire sur `/[sport]/free`.
Classement du jour et stats perso viendront ensuite ; ce bloc ne fait que créer le défi.

### Règles du tirage

- **Uniforme** parmi les joueurs du sport ayant au moins un membership (sans membership, un
  joueur n'est relié à personne). Pas encore de bande de fame : le score v1 existe
  (`012_fame_score.sql`) mais le tirage ne le lit pas — voir l'étape 18.
- **Résoluble** et à **au moins 2 liens** : à 1 lien, le mode facile résout la paire tout seul.
  Pas de borne haute sur la distance — le plus court chemin est calculé et stocké
  (`optimal_links`), c'est le « par » du futur classement.
- **Mode facile uniquement** : une seule règle pour tout le monde, donc un seul classement.
- **Un jour = Europe/Paris**, calculé par le serveur (`challengeDayOf`, `src/domain/dailyChallenge.ts`).
  La base ne décide jamais de la date.

### Stockage — `013_daily_challenges.sql`

Table `daily_challenges`, PK `(sport, day)`, la paire est **figée** une fois tirée (un tirage
recalculé depuis une graine bougerait au premier import). `solution` (un plus court chemin) est
gardée pour plus tard mais **ne sort jamais** : RLS sans policy, lue et écrite uniquement par
`service_role`. La route utilise donc `supabaseAdmin()`.

- `player_shortest_path(sport, from, to)` — BFS SQL sur le graphe biparti joueur → (club, saison)
  → joueur ; chaque club-saison n'est développé **qu'une fois**, donc chaque membership est lu au
  plus deux fois. Mesuré sur un graphe synthétique de 8 000 joueurs / 40 000 memberships : 7 à
  155 ms pour une paire reliée, 175 ms pour une paire non reliée (le pire cas : toute la
  composante est parcourue). La première version, qui redéveloppait un effectif par joueur, prenait 1,2 s.
- `generate_daily_challenge(sport, day)` — get-or-create d'un jour, sous un verrou consultatif
  par sport : deux tirages simultanés du même jour convergent sur la même paire (testé à 6 en
  parallèle). Jusqu'à 20 tirages.
- `ensure_daily_challenges(today)` — tire tout jour manquant depuis le lancement de chaque sport
  jusqu'à **demain** inclus. Lancé **toutes les heures** par pg_cron (`ensure-daily-challenges`,
  `5 * * * *`) : le défi est publié **chaque jour, visiteurs ou non**, celui du lendemain existe
  avant minuit, et une panne du job est rattrapée au passage suivant. Horaire plutôt qu'à minuit :
  pg_cron compte en UTC, et minuit à Paris tombe à 22 h ou 23 h UTC selon l'heure d'été.
  L'API garde un repli à la demande pour le jour courant.

### Numéro du défi — à la Wordle

`number = day − jour de lancement + 1`, par sport. Le jour de lancement est celui du **premier
défi** du sport : rien à configurer, et un sport ajouté plus tard démarre à son propre #1. Le
numéro suit le calendrier, jamais les visites : un jour rattrapé en retard reçoit le numéro qu'il
aurait eu à l'heure. Affiché « Défi du jour #N ».

⚠️ **Appliquer `013` lance la série** : le premier passage du job fixe le #1 au jour même (heure
de Paris). Un tirage de test sur la base de prod avant le lancement décalerait toute la série —
pour relancer, vider la table. Un jour antérieur au lancement est refusé.

⚠️ Le fuseau `Europe/Paris` est écrit **deux fois** : `CHALLENGE_TIME_ZONE` (API) et la commande
du job pg_cron. Les changer ensemble.

### Endpoint

| Route | Rôle |
|---|---|
| `GET /api/:sport/daily` | paire du jour `{ sport, day, number, playerA, playerB, optimalLinks }`, sans solution |

Les coups passent toujours par `POST /api/:sport/move` en `easy` : rien ne lie encore un coup au
défi — c'est le travail de l'étape classement (résultats vérifiés côté serveur).

---

## ✅ Bloc 7 terminé — Accueil : première visite + règles du jeu

### Reconnaître une première visite, sans compte

Par **navigateur**, via `localStorage` (`src/lib/visitor.ts`) — pas par personne : un autre
appareil, une fenêtre privée ou des données effacées comptent comme une première visite, et rien
ne reconnaît la même personne d'un appareil à l'autre. Pas d'empreinte navigateur (fingerprinting) :
c'est du pistage au sens du RGPD. Rien n'est envoyé au serveur.

| Clé | Contenu |
|---|---|
| `ipw.playerId` | UUID anonyme, créé à la première visite. Envoyé avec « Commencer » et chaque coup du défi du jour : c'est sous cet id que le serveur tient le résultat (Bloc 11) — doublé d'un cookie `ipw_vid` (Bloc 24) |
| `ipw.rulesSeen` | version des règles lue et fermée |
| `ipw.daily.<sport>` | `{ day, livesLeft, outcome?, board? }` du dernier défi joué dans ce sport (`src/lib/dailyProgress.ts`) — vies restantes, plateau en cours, et `won`/`lost` une fois fini ; le menu colore la carte tant que c'est aujourd'hui (Paris) |
| `ipw.daily.<sport>.<day>` | même forme, pour tout **autre** jour : un défi passé joué depuis les archives, ou le dernier jour poussé par un plus récent (ses vies et son plateau restent — Bloc 23) |

`RULES_VERSION` : l'incrémenter quand les règles changent assez pour que tout le monde les relise.
Stockage indisponible (Safari privé, données bloquées) → lu comme « visiteur connu, règles vues » :
mieux vaut sauter la pop-up que la rouvrir à chaque page. `crypto.randomUUID` n'existe qu'en
contexte sécurisé (HTTPS/localhost) — repli sur `getRandomValues`.

### La pop-up « Comment jouer »

`RulesProvider` (layout racine) : s'ouvre **une fois, sur la première page atteinte**, quelle
qu'elle soit (un lien partagé arrive directement sur `/rugby`). Le bouton « ? » fixe la rouvre
partout ; l'accueil a aussi un bouton « Comment jouer ». `<dialog>` natif avec `showModal()` : focus piégé, Échap, fond — aucune dépendance.
Exclue de `/admin`. Les badges de fame réutilisent les couleurs des cartes du plateau
(sélecteurs partagés `.fame-badge--*`).

---

## ✅ Bloc 8 terminé — Menu principal + À propos

L'accueil devient le **menu principal** (`src/components/home/HomeMenu.tsx`), en trois bandes : le
titre en haut, **les sports au centre** (grandes cartes, une par sport, qui ouvrent son défi du
jour ; **vertes avec ✓** quand le défi du jour est déjà gagné, pour pousser vers les autres
sports), et tout le reste en bas :

- ~~**partie libre** par sport en lien secondaire~~ : depuis le Bloc 25, sous le défi de chaque sport ;
- **Comment jouer** (ouvre la pop-up des règles), **Classement** (Bloc 22), **Mes stats** (Bloc 19)
  et **À propos**. Pas de connexion : le visiteur anonyme suffit (Bloc 22).
- Pendant une partie le menu est **caché** : un bouton « ☰ Menu » fixe en haut à gauche
  (`MenuButton`, pendant du « ? » à droite, 44 px tous les deux, à 12 px du haut et du bord)
  ramène à l'accueil — icône seule sur mobile. La barre du jeu fait 68 px pour les contenir. Absent de
  l'accueil et de `/admin`. La barre du jeu réserve la place des deux boutons.

**Partie libre ouverte à tous**, ni compte ni don : c'est ce qui fait revenir une fois le défi du
jour résolu, et les données rugby sont extraites de allrugby.com / all.rugby — les faire payer,
même via un don, est juridiquement plus risqué qu'un jeu gratuit avec une cagnotte facultative. Les
comptes et donateurs gagneront des **bonus** (historique, stats, badge), jamais un accès.

**Écran du défi** (`DailyIntro`) : « Défi du jour #N » et la date en grand en haut, puis les deux
joueurs en boutons — un clic ouvre leur **carrière** (`PlayerCareerDialog`), club par club, pour
qui ne les connaît pas. Même fenêtre que les règles : `<dialog>` factorisé dans
`src/components/shared/Modal.tsx`. La carrière servira aussi au futur « joker » sur les cartes du
plateau.

`GET /api/players/:id/career` → `{ player, stints }` : les memberships groupés en **passages**
(saisons consécutives dans un même club, `toCareerStints` dans `src/domain/career.ts`), du plus
ancien au plus récent, matchs additionnés (null si aucune saison n'en donne).

`/about`, volontairement court : origine des données (rugby : allrugby.com + all.rugby ; football :
Transfermarkt via `dcaribou/transfermarkt-datasets`, CC0), auteur (`louisaldsr` → GitHub),
formulaire de contact « bientôt ». Pas de dons pour l'instant.

---

## ✅ Bloc 9 terminé — Vies dans le défi du jour

**3 vies, fixes** (`DAILY_LIVES`), défi du jour seulement — la partie libre n'en a pas. Un coup
coûte une vie **uniquement** s'il est jugé sans lien : aucun club ni saison en commun avec le
plateau. Jamais pour un doublon, une erreur réseau/serveur, ni une partie déjà finie. À 0, la
journée est **perdue** : écran « Plus de vies », carte rouge (✕) dans le menu, pas de rejeu.

### Code de rejet

`moveRules` renvoie `{ code, reason }` au lieu d'une phrase (`src/game/moveRejection.ts`) :
`not-connected` · `already-on-board` · `wrong-kind` · `game-over`. Seul `not-connected` coûte une
vie. Le code traverse `moveService` → `remoteEngine` ; une erreur de transport n'a **pas** de code
(le coup n'a pas été jugé). Le client affiche `t.game.rejections[code]` — traduit, là où `reason`
restait en français.

### Persistance

Vies, issue **et plateau** sauvés à chaque changement dans `ipw.daily.<sport>` : recharger ne rend
pas les vies, et un jour fini (gagné ou perdu) s'ouvre sur son écran de fin (`DailyFinished`), pas
sur une nouvelle partie. Dès le premier « Commencer », le plateau (`board` : nœuds, arêtes, joueurs,
clubs, coups, heure de départ) est gardé : quitter la page et revenir rouvre **la même partie**, sans
repasser par l'intro — `createRemoteEngine(…, resume)` reconstruit le moteur. Sûr sans confiance :
le serveur revalide chaque arête au coup suivant. Un plateau malformé est jeté entier (les vies
restent) ; gagné, il est gardé avec sa chaîne (voir Bloc 10) ; perdu, il est gardé aussi (Bloc 20). **Contournable** en effaçant les données du site — la vraie garantie
viendra des résultats stockés côté serveur (étape 17).

~~Pas de solution affichée en cas de défaite~~ : depuis le Bloc 20, le serveur la révèle à un
visiteur dont il a **enregistré** la fin de journée.

### Game design

Cœurs **cartoon** (SVG : contour épais, aplat rouge et bande d'ombre franche, reflet blanc, ombre
portée sans flou), sans libellé — les cœurs se suffisent — posés en bas du plateau
(`.game-screen-board`), centrés, sans bloquer les clics (`LivesBar`) ; le même cœur sert sur
l'écran de victoire. Le cœur perdu gonfle et se vide, la rangée tremble, l'écran **flashe rouge ~1 s**
(`.life-flash`, rendu hors de l'écran de jeu pour jouer aussi sur la dernière vie). Réduit à une
teinte douce sans secousse sous `prefers-reduced-motion`. Perte annoncée aux lecteurs d'écran
(`aria-live`). Après un coup refusé, la saisie se vide pour le coup suivant (sauf erreur réseau :
on peut réessayer tel quel). `RULES_VERSION` passe à 2 : tout le monde revoit les règles une fois.

---

## ✅ Bloc 10 terminé — Victoire sur le plateau

Gagner ne remplace plus le plateau par un écran de résultats : le plateau **reste**, et les résultats
s'ouvrent en pop-up par-dessus (`VictoryDialog`, sur `Modal`). Elle se ferme **à la main** (« Voir le
plateau », Échap, fond) — pas de fermeture automatique : on y lit ses stats. Une barre remplace
alors la saisie (`won-bar` : depuis le Bloc 25, un seul bouton **Résultats** pour la rouvrir). Le chrono s'arrête au coup gagnant (`finishedAt`), le temps affiché ne dérive plus.

**Chaîne gagnante** (`.game-board--won`, CSS seul) : ses cartes prennent une bordure holographique
**dorée** avec un reflet qui balaie la carte — le shimmer des *unsung*, en or — et s'allument l'une
après l'autre depuis A (`--path-step`, 180 ms) ; ses liens coulent en pointillés dorés ; le reste
passe à 40 %. Le badge de fame reste. Figé sous `prefers-reduced-motion`.

Un défi **gagné** garde son plateau (`board.path`, `board.finishedAt`) : y revenir rouvre le plateau
gagnant, pop-up fermée. Un défi perdu, ou gagné avant cette version, s'ouvre sur `DailyFinished`.

---

## ✅ Bloc 11 terminé — Résultats du défi et classement du jour (côté serveur)

Le classement se calcule sur ce que **le serveur a vu**, jamais sur ce que le navigateur déclare.
Le client ne dit que *qui* il est (`ipw.playerId`) ; le nombre de tentatives et les deux horodatages
viennent du serveur. Les joueurs en voient le podium et leur rang (Bloc 22) ; le classement complet
se lit par `npm run daily:ranking -- --sport=rugby [--day=YYYY-MM-DD]`.

### Stockage — `015_daily_results.sql`

`daily_results`, PK `(sport, day, visitor_id)`, FK vers `daily_challenges`. RLS sans policy,
`service_role` seul (comme `013`).

| colonne | sens |
|---|---|
| `started_at` | heure serveur de « Commencer » (`POST /api/:sport/daily/start`) ; à défaut, du premier coup |
| `attempts` | coups **jugés** : acceptés, ou refusés `not-connected`. Pas un doublon, pas une erreur réseau |
| `lives_lost` | les refus `not-connected` ; à `DAILY_LIVES` le jour est perdu |
| `outcome` / `finished_at` | `won`/`lost` + heure serveur du coup final ; NULL en cours |
| `links` | longueur de la chaîne gagnante |

- `record_daily_move` compte un coup **seulement si la paire est celle du jour** (un plateau resté
  ouvert après minuit ne compte pas), et **fige** une ligne terminée (`WHERE outcome IS NULL`) :
  rejouer après avoir vidé son stockage local ne change pas le résultat de ce visiteur.
- `POST /api/:sport/move` accepte `daily: { visitorId }` (mode facile seulement) et enregistre après
  jugement. **L'enregistrement ne fait jamais échouer le coup** : une erreur est seulement loguée.
- `lives_lost` et `links` sont gardés dès maintenant pour le futur vrai score.

### Le classement (v1)

Gagnants seulement : **1. le moins de tentatives, 2. le temps le plus court** (`finished_at −
started_at`). Égalités à rang partagé (`RANK()`). Score futur : vies restantes, fame des joueurs
trouvés.

### Limites connues

- Un visiteur = un navigateur : fenêtre privée ou données effacées = nouvel id = nouvelle ligne,
  donc une nouvelle chance au classement. La vraie garantie viendra des comptes.
- Un client forgé qui n'appelle pas « start » fait partir son temps du premier coup.

| Route | Rôle |
|---|---|
| `POST /api/:sport/daily/start` | `{ day, visitorId }` → 204 ; horodate le départ (idempotent), 409 si `day` est dans le futur (un jour passé = joué en retard, Bloc 23) |
| `POST /api/:sport/daily/stats` | `{ visitorId }` → stats perso du sport (Bloc 19) |
| `POST /api/:sport/daily/ranking` | `{ visitorId?, day? }` → podium du jour (ou d'un jour passé, Bloc 23) + rang du visiteur (Bloc 22) |
| `POST /api/:sport/daily/solution` | `{ day, visitorId }` → une chaîne la plus courte, au format du plateau (Bloc 20) ; 403 tant que la journée n'est pas finie côté serveur |

---

## ✅ Bloc 12 terminé — Carrière sur toutes les cartes, comptée comme indice

Toute carte joueur du plateau ouvre sa carrière (`PlayerCareerDialog`, déplacé dans `shared/`) : un
**clic** sans déplacement (< 5 px — le plateau capture le pointeur pour le glisser-déposer, aucun
`click` n'atteint la carte), ou Entrée/Espace au clavier (`role="button"`).

**Gratuit, mais enregistré** : la carrière dit *où* chercher (clubs, saisons), pas *qui* y jouait —
le puzzle reste. La faire payer ne taxerait que les honnêtes : la même info est à une recherche
Google, et un joueur bloqué qui part est pire qu'un joueur aidé. Un futur score **récompensera** la
partie sans indice (badge, bonus) plutôt que de pénaliser l'aide.

- `016_daily_hints.sql` : `daily_results.hint_player_ids` (joueurs **distincts** dont la carrière a
  été ouverte) ; `record_daily_hint` ; `daily_ranking` renvoie `hints` — affiché par
  `daily:ranking`, **pas** utilisé dans l'ordre.
- `POST /api/:sport/daily/hint` `{ day, visitorId, playerId }` → 204 ; 409 si `day` est dans le futur.
- **Pas un indice** : A et B (l'intro les montre, tout le monde en a besoin), une carrière ouverte
  après la fin du jour (ligne figée), la partie libre.
- Sur parole : `/api/players/:id/career` est public, une lecture directe n'est pas comptée — pas
  plus qu'une recherche Google.

---

## ✅ Bloc 13 terminé — Visiteurs et noms générés

Le classement affiche un **nom généré** au lieu d'un UUID : un adjectif et un poste/rôle tirés de
listes curatées (`src/domain/visitorName.ts`) — « Pilier Pressé », « Hasty Prop ». 40 × 28 = 1 120
paires ; depuis `018`, un numéro les rend uniques (Bloc 15).

- **Généré, pas choisi** : des listes curatées n'ont rien à modérer. Un pseudo libre viendra avec
  les comptes, et avec lui son filtrage (format, liste noire FR/EN après normalisation + leetspeak,
  noms de vrais joueurs réservés via `players.search_name`, signalement + reset admin).
- **Stocké en clés**, pas en texte (`visitors.name_adjective` / `name_noun`, `017_visitors.sql`) :
  tiré une fois, jamais changé, lu dans la langue du lecteur. Libellés dans `src/i18n`
  (`visitorNames`), typés sur les clés : une clé sans libellé ne compile pas. Les listes ne font
  que **grandir** — retirer une clé rendrait un nom stocké illisible (`visitorNameOf` → null).
- Règles des listes : bienveillant (taquin au plus), aucun double sens dans une langue (pas de
  « hooker »), noms français tous masculins — l'adjectif n'a jamais à s'accorder.
- Créé au **Start** (`ensure_visitor`, idempotent) ; un échec est seulement logué. Pas de FK depuis
  `daily_results` : un coup peut arriver avant le Start, le nom manque alors (`—`).
- `visitors` est l'endroit où un compte s'accrochera : s'inscrire **réclamera** le visiteur et ses
  résultats, sans repartir de zéro.
- `npm run daily:ranking -- --sport=rugby [--lang=en]` affiche les noms (français par défaut).

---

## ✅ Bloc 14 terminé — Logo, favicon, carte de partage

Le logo est un **monogramme** : « IPW » blanc sur une tuile violette (`--accent`), souligné par un
lien doré entre deux joueurs (l'or de A, B et de la chaîne gagnante). Deux tailles :

- **`brand/logo.svg`** — la tuile IPW, à partir de **48 px** (icône d'app, écran d'accueil, partage).
- **`brand/logo-small.svg`** — le lien seul, **sous 48 px** : les lettres ne se lisent plus à 16 px.
- `brand/wordmark.svg` — « I Played With », pour la carte de partage.

Lettres et nom sont **vectorisés** (Archivo 800, largeur 66/72, licence OFL) : aucun fichier ne
dépend d'une police. `npm run brand:render` régénère depuis `brand/` les fichiers que Next.js
sert d'après leur nom dans `src/app/` : `icon.svg`, `favicon.ico` (16 et 32 petit logo, 48 grand),
`apple-icon.png` (180 px, **plein cadre** : iOS arrondit lui-même) et `opengraph-image.png`
(1200 × 630). Modifier un SVG de `brand/` → relancer le script et committer les sorties.

Le menu principal affiche `brand/logo.svg` au-dessus du titre, importé tel quel (`next/image`, SVG
non optimisé) : une seule source, rien à copier dans `public/`. Décoratif (`alt=""`), le `<h1>`
porte le nom.

La carte de partage est **statique** ; `twitter.card = summary_large_image` dans le layout. Son URL
absolue est bâtie sur `iplayedwith.com` (`metadataBase`, Bloc 21).

---

## ✅ Bloc 15 terminé — Nom unique, affiché sur le menu

- **Numéro à 3 chiffres** (`018_visitor_number.sql`) : « Pilier Pressé 042 ». 40 × 28 × 1 000 =
  **1 120 000** noms, **uniques** (index unique `(adjectif, nom, numéro)`). La base tire un numéro
  encore libre pour la paire ; paire pleine ou numéro pris au même instant → le serveur retire une
  autre paire (`ensureVisitorName`, 5 essais). Les visiteurs existants ont reçu un numéro distinct.
- `ensure_visitor` **renvoie** le nom (existant ou créé). `POST /api/visitor` `{ visitorId }` →
  `{ adjective, noun, number }` — POST car le premier appel crée le visiteur.
- **Badge en haut à gauche du menu** (`VisitorBadge`), là où le bouton Menu se trouve en partie :
  mis en cache dans `ipw.name` (avec l'id auquel il appartient) → affiché sans requête dès la
  deuxième visite. Pas de nom sans stockage ; échec serveur = pas de badge.
- **Toujours visible en partie** : dans la barre du haut du plateau, à côté du badge de difficulté ;
  sur téléphone, sur une ligne à lui sous les joueurs et le chrono (la barre passe en grille,
  1ʳᵉ ligne de 44 px alignée sur les boutons fixes). Même source que le badge : `useVisitorName`.
- e2e : `/api/visitor` est mocké **par défaut** dans `fixtures.ts` (toute page peut mener au menu).

---

## ✅ Bloc 16 terminé — Tirage dans une bande de fame (60–80)

Tiré uniformément, un nouveau joueur tombait sur deux inconnus (⅔ du rugby et ⅘ du football sont
`unsung`). Le tirage vise désormais **juste sous les stars** : des noms qu'on a pu entendre, sans
les quelques célébrités dont tout le monde trouve la chaîne. `DRAW_FAME_BAND = { min: 60, max: 80 }`
(`src/domain/drawFameBand.ts`) — mesuré en revision 2 : **427** joueurs rugby, **787** football.

- **Une bande de score, pas un palier** : elle chevauche le haut de `known` et le bas de `famous`.
  Jamais affichée.
- **« Aléatoire » en partie libre** : `findRandomInFameBand` (lit `player_fame`, index
  `(sport, score)`), repli sur `findRandom` uniforme si la bande a moins de 2 joueurs.
- **Défi du jour** : `019_daily_fame_band.sql` remplace `generate_daily_challenge` — passe 1 dans
  la bande (joueurs avec membership), passe 2 sur tout le sport si la bande ne donne pas de paire
  en 20 essais. Toujours ≥ 2 liens. Les jours déjà tirés restent figés ; celui de **demain** est
  déjà tiré à l'application — le retirer (contrôles en bas du fichier).
- ⚠️ La bande est écrite **deux fois** (TS + constantes SQL) : les changer ensemble.

---

## ✅ Bloc 17 terminé — Une seule colonne `username`

`020_visitor_username.sql` remplace les trois colonnes de `018` par `visitors.username`, **unique**.
Un nom généré y est stocké en **clés** séparées par `:` — `laidBack:playmaker:742` — et toujours lu
dans la langue du lecteur : `formatUsername` (`src/domain/visitorName.ts`) le redécoupe
(`generatedNameOf`) ; une valeur qui ne se découpe pas en clés connues est affichée **telle quelle**.
C'est la place du futur pseudo libre, qui ne devra donc **jamais contenir `:`**.

- Le serveur tire **les trois parties** (`randomVisitorName`) ; nom déjà pris → l'index unique
  refuse, `ensureUsername` retire tout (5 essais). Plus de recherche de numéro libre en SQL.
- **Unique une fois normalisé** (`search_normalize`, la règle de la recherche — index posé par `021`) : « Dupont »,
  « dupont » et « Dupönt » sont un seul nom — personne ne se fait passer pour un autre à une
  majuscule ou un accent près.
- API : `POST /api/visitor` → `{ username }` ; cache `ipw.name` = `{ playerId, username }` (un cache
  à l'ancien format est ignoré, le serveur renvoie le même nom). `daily_ranking` renvoie `username`.
- ⚠️ Appliquer `020` et déployer **ensemble** : entre les deux, un nouveau visiteur n'a pas de nom
  (logué, badge absent) — les résultats comptent quand même.

---

### Renommer depuis le menu

**Sur place** : un clic sur le badge du menu (✎) le transforme en champ, nom présélectionné
(`VisitorBadge`). Entrée **ou un clic ailleurs** enregistre ; Échap ou ✕ annule. Un nom refusé
garde le champ ouvert avec la raison dans une bulle sous le badge. Laisser un nom généré tel
qu'affiché ne change rien (il reste traduisible). Dans la barre du jeu, le nom est seulement affiché. `PATCH /api/visitor` `{ visitorId, username }` :

| réponse | sens |
|---|---|
| 200 `{ username }` | renommé (nom nettoyé : espaces en trop retirés) |
| 400 `{ error: 'invalid', problem }` | `too-short` · `too-long` · `characters` |
| 409 `{ error: 'taken', suggestions }` | pris — jusqu'à 3 variantes **vérifiées libres** (« Dupont42 ») |

- Règles (`parseTypedUsername`, `src/domain/username.ts`, partagé dialogue + serveur) : 3 à 20
  caractères, **lettres latines** (accents compris), chiffres, espaces et `. _ ' -` ; au moins 3
  lettres ou chiffres. Latin seul : l'unicité se juge sur la forme normalisée (a–z, 0–9), un nom
  cyrillique s'y réduirait à ses chiffres. Jamais de `:`.
- SQL (`021_visitor_rename.sql`) : `rename_visitor` (`renamed` / `taken` / `unknown`),
  `free_usernames` ; `service_role` a `UPDATE (username)` seulement. `020` a été appliqué **avant**
  que le renommage y soit ajouté : tout ce que le renommage demande vit donc dans `021`.
- Nom pris : badge ambré qui secoue la tête, bulle « déjà sur la feuille de match », suggestions
  en un clic. Pas une erreur rouge — quelqu'un est juste arrivé avant.
- ⚠️ **Pas de filtre de mots** : depuis le Bloc 22, le nom des trois premiers du jour est **public**.
  Risque accepté tant que le trafic est faible ; la liste noire (FR/EN, leetspeak) et les noms de
  vrais joueurs réservés restent à faire.
- Qui connaît le `visitorId` d'un navigateur peut renommer ce visiteur — même modèle de confiance
  que les résultats ; la vraie garantie viendra des comptes.

---

## ✅ Bloc 18 terminé — « Comment jouer » en démo animée

Retours joueurs : les règles étaient floues, et le texte d'ouverture était sauté. La pop-up montre
désormais une **partie qui se joue toute seule**, en boucle (`RulesDemo`) : un mini-plateau aux
classes du vrai (`.node-card`, paliers, chaîne dorée gagnée), une saisie qui se tape, et une
légende par scène — les deux joueurs → un bon coup → un coup sans lien qui coûte une vie → le coup
gagnant. Sous la démo, quatre lignes seulement : défi du jour, carrière (indice), paliers, partie libre.

- **Une horloge, tout le reste en découle** : chaque instant de la boucle (19 s) se rend pareil ;
  la barre de progression saute à une scène comme si elle avait été jouée. Pause/lecture (WCAG
  2.2.2). Repart du début à chaque ouverture, à l'arrêt quand la pop-up est fermée.
- **Vraie chaîne football**, avec les noms que tout le monde connaît : Messi —FC Barcelona
  2013-2014— Neymar —PSG 2017-2018— Cavani —Manchester United 2021-2022— Ronaldo ; Haaland ne partage
  rien avec eux. Changer un nom = revérifier ses memberships : un lien faux enseignerait une fausse règle.
- `prefers-reduced-motion` : l'histoire défile, sans pop, secousse ni fondu.
- La démo est en football, quel que soit le sport de la page : Messi et Ronaldo parlent à tout le monde.
- `RULES_VERSION` inchangé (2) : les règles n'ont pas changé, seulement leur présentation.

---

## ✅ Bloc 19 terminé — Score du défi (joueurs en trop) + stats perso

Le classement du jour (Bloc 11) triait par tentatives sans rien afficher, et rien ne se comparait
d'un jour à l'autre. Le score compte désormais les **joueurs en trop** — `src/domain/dailyScore.ts` :

```
added  = joueurs ajoutés au plateau (coups acceptés)
needed = optimal_links − 1   (le moins de joueurs possible pour relier A et B)
score  = added − needed      → « Parfait ! », « +1 », « +2 »…, jamais négatif, sans limite
```

- **Lisible d'un coup d'œil, sans jargon** : pas de vocabulaire de golf (« par », « coups ») —
  « Parfait ! » + « Chaîne la plus courte trouvée », ou « +2 » + « 2 joueurs de plus que la chaîne la plus courte ».
- **Pas de plafond** : on peut ajouter autant de joueurs qu'on veut ; seules les vies font perdre.
- **Tout joueur ajouté coûte 1**, sur la chaîne ou en cul-de-sac : ajouter des joueurs ne paie
  jamais. Classer à la longueur de la chaîne seule récompensait le spam — la chaîne est le plus
  court chemin *du plateau*, et chaque joueur ajouté ne peut que la raccourcir.
- **Un raté coûte une vie, jamais un point** : les vies décident gagné/perdu, le score dit à quel
  point. Pas deux sanctions pour la même faute. Les vies restantes ne départagent **pas**.
- **Le temps ne départage que les ex-aequo** : le convertir en points le rend dominant ou
  négligeable, et c'est le seul signal qu'un client forgé peut tordre (sans « start », son chrono
  part du premier coup).
- **Classement** (`daily_ranking`, `022_daily_score.sql`) : gagnants par score puis temps ; puis
  **tous les perdants, au même rang** (gagnants + 1, « Failed ») — un seul gagnant voit que tous
  les autres ont échoué. Une partie en cours n'est pas listée. Indices affichés, pas classés.
- **Comparer les jours = les joueurs en trop** : les joueurs ajoutés dépendent de la paire, « +1 »
  veut toujours dire un de plus que nécessaire. Un jour à 4 joueurs nécessaires reste plus dur à
  réussir parfaitement qu'un jour à 1 : accepté, comme les mots difficiles de Wordle.
- ⚠️ Formule écrite **deux fois** (TS + SQL) : les changer ensemble.

### Fame : pas encore tranché, donc les données d'abord

Moins un joueur est connu, plus le trouver devrait valoir — mais : seuls les joueurs **de la
chaîne** pourraient compter (sinon le spam repaie), certains jours n'offrent aucun chemin par des
*unsung* (les « +N » cesseraient d'être comparables), et la fame mesure la longévité, pas la
célébrité. Le score reste les seuls joueurs en trop ; le serveur **stocke la chaîne gagnante**
(`daily_results.path_player_ids`, A → B) et `daily:ranking` affiche une colonne `chain u/k/f`
(unsung / known / famous au milieu de la chaîne, à la fame du jour). Pistes à simuler sur de vrais
jours : départage avant le temps, ou bonus (un *unsung* sur la chaîne retire un joueur en trop). Le classement n'est pas public :
changer son ordre plus tard ne coûte rien.

### Stats perso

`POST /api/:sport/daily/stats` `{ visitorId }` → `DailyStats` : joués, gagnés, séries, score moyen,
répartition (Parfait, +1 … +4, +5+, Perdu) et la case du jour. Calculé par `dailyStats()` depuis
`daily_stats` (une ligne par jour du visiteur). Une **série** suit le calendrier (un défi est
publié chaque jour) : un jour manqué ou commencé sans être fini la casse ; aujourd'hui pas encore
fini ne la casse pas. POST pour garder l'id hors des URL et des logs (qui le connaît peut renommer
le visiteur).

**Affiché, volontairement peu** : deux tuiles seulement — **Joués** et **Victoires** (« 75 % ») ;
séries et moyenne sont calculées mais pas montrées (jugées peu lisibles), à ressortir plus tard.
Puis une barre par score, **une couleur par score** (`--score-*`) : Parfait en or (★, halo),
+1 vert → +2 citron → +3 ambre → +4 orange → +5+ et Perdu en rouge ; un score jamais atteint
reste un moignon gris ; la barre du jour est cerclée, avec une pastille « Aujourd'hui ».

La pop-up de victoire du défi tient en un coup d'œil : le score en or, la chaîne, puis seulement
le temps et les vies — « votre chaîne », « meilleur possible » et « coups » sont retirés, le score
les résume (la partie libre, sans score, garde « coups »). Les stats du sport suivent, sous le
score ; aussi sur l'écran de fin (`DailyFinished`).

**« Mes stats » dans le menu** (`StatsDialog`, quitte la liste « Bientôt ») : d'abord **le pseudo**
du visiteur (`useUsername`, relu à chaque ouverture — un renommage depuis le badge s'y voit), puis
**un onglet par sport** (motif WAI-ARIA : flèches, Début/Fin). Tous les sports sont chargés à
l'ouverture et gardés : changer d'onglet est instantané.

Décoratives : sans visiteur stocké ou si la requête échoue, le panneau est absent. e2e :
`/api/:sport/daily/stats` est mocké **vide par défaut** dans `fixtures.ts`.

⚠️ Appliquer `022` **avant** de déployer : `record_daily_move` garde un `p_path` à `DEFAULT NULL`,
le build actuel continue d'enregistrer ; le nouveau build lit `daily_stats`.

---

## ✅ Bloc 20 terminé — La solution proposée, posée sur le plateau

Une fois la journée finie, gagnée ou perdue, un **interrupteur « Solution proposée »** (« Proposed
Solution »), **sur le plateau, en haut au centre** — pendant des cœurs en bas —, pose sur le plateau
du joueur **une** des chaînes les plus courtes, celle que le tirage a stockée
(`daily_challenges.solution`). Pas de panneau à part, pas de légende : la solution vit dans l'arbre.

- **L'interrupteur** est une vraie case à cocher (`role="switch"`, clavier et lecteurs d'écran),
  dessinée en pilule à bouton glissant, bleue une fois allumée. En chargement, le bouton pulse ; en
  échec, une seule ligne « Impossible de charger la solution » apparaît dessous.
- **Éteint, rien** : le plateau est celui du joueur. **Allumé**, le plateau du joueur passe **dans
  l'ombre** (cartes à 18 %, désaturées ; liens presque effacés — la chaîne dorée d'un plateau gagné
  aussi) et la solution s'allume : ses joueurs prennent un **anneau bleu lumineux**, ses liens
  courent en **trait plein bleu**, avec un halo, cliquables comme les autres (club · saison). Bleu
  `--solution` = `#60a5fa`, une couleur à elle (l'or est la chaîne gagnée, le teal le palier *known*,
  le violet l'accent).
- **Jamais en double** : un joueur de la solution déjà sur le plateau **est** la carte de la
  solution — même carte, sortie de l'ombre. Seuls ceux que le joueur n'a jamais ajoutés apparaissent
  en cartes **« proposées »** : fond plein, bordure pointillée bleue, **jamais estompées** (les
  sélecteurs doublent `.node-card` pour passer devant l'atténuation du plateau gagné).
- **Placées sur la chaîne** (`chainSpot`, `GameBoard`) : une carte proposée se pose entre ses
  voisins de chaîne déjà placés, au prorata de son rang — la solution se lit d'un trait, de A à B —
  puis au plus proche emplacement libre.
- Rallumée, la solution revient de la mémoire (une seule requête). Les boutons des pop-ups de fin
  l'allument et ferment la pop-up.
- **Format du plateau** (`DailySolution`, `src/domain/dailySolution.ts`) : `{ path, players, clubs,
  edges }`, deux arêtes par lien vers le (club, saison) partagé — `linksOfChain` choisit la saison
  **la plus récente** quand une paire en a partagé plusieurs (l'id du club départage), puis
  `edgesOfChain`. Une paire qui ne partage plus rien (données changées depuis le tirage) : 500 logué,
  message d'échec.
- **Une journée perdue garde son plateau** (phase `lost`) : la dernière vie ouvre une pop-up
  « Plus de vies » par-dessus (`DefeatDialog`, jumelle de `VictoryDialog` : stats, voir le plateau,
  voir la solution, partie libre), puis une barre de fin rouge. Le plateau perdu est sauvé
  (`ipw.daily.<sport>`) et rouvert au retour. `DailyFinished` ne sert plus qu'aux journées sans
  plateau (perdues avant cette version) : l'arbre du joueur y est **perdu pour de bon** (le
  navigateur l'a jeté, le serveur ne garde que les compteurs) — l'écran y montre donc un plateau de
  A et B seuls, le même interrupteur en haut, avec une mention « votre plateau n'a pas été gardé ».
- Logique partagée : `useDailySolution` (requête à la demande, mémoire seule) et `SolutionOverlay`
  (l'interrupteur, posé sur le plateau ; `GameScreen` le reçoit en `boardOverlay`), utilisés par le
  plateau de jeu et par `DailyFinished`.

### Jamais lisible avant la fin

- **Ni dans les fichiers ni dans le bundle** : la solution n'existe qu'en base, jamais dans le code.
- **Ni dans l'API du jour** : `generate_daily_challenge` renvoie toute la ligne, solution comprise —
  le repository la jette ; `GET /api/:sport/daily` n'envoie que la paire et sa longueur (test
  `dailyChallengesSecret`).
- **Ni avant la fin, ni sans le demander** : le bouton n'existe qu'une fois la partie finie, et le
  serveur (`POST /api/:sport/daily/solution`) ne répond qu'à un visiteur dont `daily_results` porte
  une issue (`won` / `lost`) — sinon **403**. Le coup final est enregistré avant la réponse du coup.
- **Ni dans le stockage** : gardée en mémoire seulement, jamais dans `localStorage` (testé).
- ⚠️ **Faille connue, acceptée jusqu'aux comptes** : un visiteur est un navigateur. Perdre exprès
  dans une fenêtre privée (trois mauvaises réponses) montre la solution, à rejouer parfaitement
  ailleurs. Choix explicite : la révéler le lendemain seulement aurait été inviolable, mais les
  perdants auraient attendu.

e2e : `/api/:sport/daily/solution` est mocké **refusé (403) par défaut** dans `fixtures.ts`.

---

## ✅ Bloc 21 terminé — Référencement Google + supervision

Le site ne disait presque rien aux moteurs : un seul titre pour toutes les pages, pas d'URL
canonique (la copie `*.vercel.app` concurrençait le domaine), ni sitemap ni robots.txt, `/admin`
indexable. Aucune supervision.

### Référencement

- **Une seule adresse** : `SITE_URL = 'https://iplayedwith.com'` (`src/lib/siteUrl.ts`) →
  `metadataBase` du layout : canoniques, `og:url` et image de partage sur le vrai domaine.
- **Titres** : accueil « I Played With — the teammates game for rugby and football », puis
  `%s · I Played With` par page (`/[sport]` « Rugby daily challenge », `/[sport]/free`, `/about`),
  chacune avec sa canonique (`generateMetadata`, libellés de `en.home.sports`). En anglais : le
  serveur ne connaît pas la langue du visiteur.
- **JSON-LD `WebSite`** dans le layout (`name` + `alternateName: IPlayedWith, iplayedwith`) : c'est
  lui qui fait afficher le nom du site par Google et relie les deux graphies.
- `src/app/robots.ts` (tout ouvert sauf `/admin` et `/api`, pointe le sitemap) ; `src/app/sitemap.ts`
  (accueil, chaque sport en défi et en partie libre, `/about`) ; `src/app/admin/layout.tsx` met
  `noindex, nofollow` sur tout le back-office.
- **Réaliste** : « i played with » est une expression courante — y sortir premier prend des semaines
  et n'est pas garanti ; « iplayedwith » / « I Played With game » viendront d'abord. Les liens vers
  le site (champ *Website* du repo GitHub, README, réseaux) aident.

### Supervision

- **Disponibilité** : `GET /api/health` → `200 { status: 'ok' }` si la base répond à une lecture
  indexée (`ping`, `src/repositories/healthRepository.ts`, délai 5 s), sinon `503 { status: 'down' }`
  (erreur seulement loguée), jamais en cache. Surveillé de l'extérieur par UptimeRobot (gratuit,
  toutes les 5 min, alerte mail) : la page d'accueil (HTTP 200) **et** `/api/health` (mot-clé `ok`)
  — la seconde attrape aussi une panne de base. ~288 lectures/jour.
- **Visites** : Vercel Web Analytics (`@vercel/analytics`, `SiteAnalytics`) — pages, pays,
  provenance. **Sans cookie**, rien dans le navigateur : pas de bandeau de consentement, même ligne que
  le Bloc 7. **Production seulement** (ni le serveur de dev ni les e2e ne chargent le script), vues de
  `/admin` écartées (`beforeSend`). Une ligne « Vie privée » sur `/about` le dit.

### À faire hors code (une fois)

1. Vercel → *Domains* : `iplayedwith.com` principal, `www` redirigé dessus.
2. Vercel → *Analytics* : activer Web Analytics (rien n'est collecté avant).
3. Google Search Console : propriété *Domaine* `iplayedwith.com`, enregistrement TXT au DNS,
   *Valider* ; *Sitemaps* → `https://iplayedwith.com/sitemap.xml` ; *Inspection de l'URL* de
   l'accueil → *Demander l'indexation*.
4. UptimeRobot : les deux moniteurs ci-dessus.

e2e (`seo.spec.ts`) : robots.txt, sitemap, balises de l'accueil et de `/rugby`, `noindex` du
back-office, et `/api/health` en **503** — la base du serveur e2e est injoignable, c'est le vrai cas
« base en panne ».

---

## ✅ Bloc 22 terminé — Classement du jour : podium + son rang

Le classement n'était lisible que par `npm run daily:ranking`. Les joueurs en voient désormais
**peu** : les **trois premiers gagnants** du jour et **leur propre rang** parmi tous ceux qui ont fini.

- **Où** : bouton **Classement** du menu (`RankingDialog`, un onglet par sport — onglets partagés avec
  Mes stats, `SportTabs`), et au-dessus des stats dans les pop-ups de victoire, de défaite et sur
  `DailyFinished`. Le coup final est enregistré avant la réponse du coup : le rang est prêt à l'ouverture.
- **Podium = gagnants seulement** (score puis temps), 🥇🥈🥉 ; moins de trois gagnants, podium plus
  court. Égalité : rang partagé, même médaille ; une égalité sur la 3ᵉ marche est coupée par l'heure de
  fin (le premier arrivé reste). Le visiteur y est marqué « Vous ».
- **Son rang** : « Votre rang **12ᵉ / 87** », gagné ou perdu (perdu : le rang que tous les perdants
  partagent, en rouge — jamais sur le podium, Bloc 25) · « Finissez le défi pour avoir votre rang »
  (en cours). Le total compte **tous les résultats finis**, perdants compris.
- **Le récap de fin en sections** (pop-ups de victoire et de défaite) : la partie (titre, score,
  chaîne, temps, vies) → **Classement du jour** → **Vos stats** → les boutons. Les titres de section
  servent de séparateurs (« ── VOS STATS ── ») ; un trait isole les boutons. « Voir la solution
  proposée » est posé **juste sous le score** (ou sous « une chaîne de N liens existait ») : la chaîne
  à laquelle le score se compare.
- **Pas de migration** : `toLeaderboard` (`src/domain/dailyLeaderboard.ts`) découpe `daily_ranking`
  (022) côté serveur. Lu en entier : à déplacer en SQL quand un jour aura des milliers de résultats.
- **Ne sort jamais** : l'id d'un autre visiteur (il permet de le renommer) ni une chaîne gagnante
  (elle donnerait un plus court chemin à qui joue encore). Le type n'a pas de champ pour eux ; un test
  vérifie le JSON.
- **Noms publics sans filtre** : risque accepté (voir Bloc 17).
- **Pas de connexion** : « Connexion » et toute la liste « Bientôt » quittent le menu ; le visiteur
  anonyme (Bloc 7) suffit. Décoratif comme les stats : requête en échec, panneau absent.

| Route | Rôle |
|---|---|
| `POST /api/:sport/daily/ranking` | `{ visitorId? }` → `{ day, total, podium, you }` du jour (Paris) ; 400 si `visitorId` n'est pas un UUID |

e2e : `/api/:sport/daily/ranking` est mocké **vide par défaut** dans `fixtures.ts`.

---

## ✅ Bloc 23 terminé — Défis passés (archives), comptés en retard

Chaque sport a sa page **`/[sport]/archive`** : tous les défis depuis le lancement, du plus récent au
plus ancien — numéro, date, paire, et le résultat du visiteur **tel que le serveur l'a enregistré**
(Parfait / +N aux couleurs des stats, Perdu, En cours ; rien s'il n'a jamais été commencé ; « en retard »
le cas échéant).
Aujourd'hui renvoie vers `/[sport]` ; un jour passé se joue sur **`/[sport]/archive/[day]`**, comme le
défi du jour (3 vies, mode facile, solution une fois fini). Liens : sous « Commencer » de chaque
sport (Bloc 25 — plus dans le menu), pop-ups de fin, `DailyFinished`.

### Ce qui compte, en retard

**En retard** = le visiteur a commencé le jour **après** sa date : la date de Paris de `started_at` est
postérieure à `day`. **Dérivé, jamais stocké** (`challenge_day_of()`, `026_daily_archive.sql`) — un jour
commencé à l'heure et fini le lendemain n'est pas en retard.

- **Stats** : un jour en retard compte dans joués, victoires et la répartition des scores — **jamais
  dans les séries** (`dailyStats`) : un jour manqué ne se rattrape pas après coup.
- **Classement du jour : jamais en retard** (Bloc 26). Un jour terminé, dont la chaîne a pu circuler,
  ne se classe pas : un résultat en retard, gagné ou perdu, n'est ni sur le podium, ni classé, ni dans
  le total — « Joué en retard — hors du classement de ce jour ». `daily_ranking` (026) les classe
  encore après les gagnants à l'heure ; `toLeaderboard` les retire et recompte le rang des perdants
  (gagnants à l'heure + 1) — pas de migration. `npm run daily:ranking` montre toujours tout, `late` compris.
- **Le podium de ce jour-là** : les pop-ups de fin et `DailyFinished` passent **leur** jour à
  `DailyRanking` (`POST /ranking` accepte `day`, jamais futur) — un jour passé montre son classement,
  pas celui d'aujourd'hui. Libellés « Classement de ce jour » sans « aujourd'hui » dès que le jour
  répondu n'est pas aujourd'hui (aussi pour un plateau resté ouvert après minuit).
- **Jamais un jour futur** : la paire de demain est déjà tirée. `isPlayableDay(day, today)` (`day ≤
  today`) garde start, indice et coup ; l'archive s'arrête à aujourd'hui (`listUpTo`), jamais `*`
  (la ligne porte la solution — test `dailyChallengesSecret`).

### Côté serveur

- Les fonctions SQL d'enregistrement prenaient **déjà** le jour et vérifiaient la paire contre lui :
  « aujourd'hui seulement » ne vivait que dans l'API. `POST /move` accepte `daily: { visitorId, day }`
  (sans `day` : aujourd'hui, pour un client plus ancien) ; start et indice acceptent un jour passé.
- Effet de bord voulu : un plateau resté ouvert après minuit compte désormais pour **son** jour (il
  n'était pas enregistré), à l'heure puisqu'il a été commencé à l'heure.
- `POST /api/:sport/daily/archive` `{ visitorId? }` → `DailyArchive` (`src/domain/dailyArchive.ts`) :
  `{ today, days: [{ …paire, result: { outcome, score, livesLost, late } | null }] }`. Sans pagination
  (un jour par jour) ; joueurs lus par lots de 150 (ids dans l'URL).
- La page d'un jour passé lit sa paire **dans l'archive**, avec le résultat serveur : un jour fini
  ailleurs (autre navigateur) s'ouvre sur son écran de fin, et les vies serveur priment sur un
  enregistrement local neuf — pas de rejeu d'un jour perdu.

### Côté navigateur

`ipw.daily.<sport>` reste le **dernier** jour joué (ce que lit le menu) ; tout autre jour vit sous
`ipw.daily.<sport>.<day>`. Jouer un jour passé ne touche jamais celui d'aujourd'hui, et le jour d'hier
n'est plus écrasé par le suivant. Grossit d'un plateau par jour joué (quelques Ko).

⚠️ `Europe/Paris` est désormais écrit **trois fois** : `CHALLENGE_TIME_ZONE`, le job pg_cron (013) et
`challenge_day_of` (026). Les changer ensemble.

⚠️ Appliquer `026` **avant** de déployer (contrôles en bas du fichier). Sans elle le build marche
quand même : `late` absent est lu « à l'heure » — mais un jour joué en retard serait classé et compté
dans les séries comme à l'heure.

e2e : `/api/:sport/daily/archive` n'est **pas** mocké par défaut — `archive.spec.ts` le mocke.

---

## ✅ Bloc 24 terminé — Partager son défi

Une journée finie, gagnée ou perdue, se partage en un clic : bouton **Partager** dans les pop-ups de
victoire et de défaite (sous le score et la solution). **Rien n'est stocké** :
le message est bâti dans le navigateur depuis le plateau gardé (`dailyShareText`, `src/lib/dailyShare.ts`).

```
I Played With · Rugby #412
Antoine Dupont → Siya Kolisi
🟩⬜🟩⬜
+2 · ❤️❤️🤍 · 4:37
2 players more than the shortest chain
iplayedwith.com/rugby/412
```

- **Jamais de spoiler** : A et B sont publics dès l'intro ; les joueurs ajoutés sont des **carrés**,
  dans l'ordre d'ajout — 🟩 sur la chaîne gagnante, ⬜ cul-de-sac. Perdu : tout est ⬜ (pas de chaîne),
  puis « 💔 Plus de vies · 🤍🤍🤍 » et « Tu fais mieux que moi ? » (le message part chez des amis : tutoiement). Les ratés ne sont que les cœurs : le
  plateau ne garde pas leur ordre.
- **Langue du partageur** (`t.daily.share`).
- **Téléphone** (pointeur grossier) : feuille de partage native (`navigator.share`) ; fermée = rien.
  **Ordinateur** : presse-papiers, « Copié » sous le bouton.

### Le lien `/[sport]/[n]` et sa carte

- Le lien **nomme le jour** : les messageries gardent un aperçu par URL, `/rugby` seul afficherait
  la carte d'un autre jour. La page ouvre **ce jour-là** : un jour passé se joue comme depuis les
  archives (Bloc 23 — `ArchivedChallengePage` le trouve par numéro), aujourd'hui renvoie vers
  `/[sport]`, un numéro que les archives ne donnent pas (pas encore atteint, archives en échec) aussi :
  un lien mène toujours à une partie. Trouvé **dans le navigateur** : la page n'attend jamais la base.
  Canonique sur `/[sport]`, une seule page à indexer.
- **Carte** (`src/app/[sport]/[number]/opengraph-image.tsx`, `next/og`) : « Daily challenge #N ·
  Rugby », A et B en cartes dorées, « Can you link them? ». **La même pour tous** : le résultat perso
  voyage dans le texte. En anglais (le serveur ne connaît pas la langue du destinataire). Archivo
  Medium / ExtraBold dans `brand/fonts/` (OFL).
- **Dégradé vertical seulement** : un halo radial triplait le PNG (314 Ko) au-delà des ~300 Ko sous
  lesquels WhatsApp affiche l'aperçu ; vertical, ~77 Ko.
- Lu par `getSharedChallenge` → `findByNumber` (sans la colonne `solution`, testé). **Un numéro au-delà
  d'aujourd'hui = null** : le défi de demain est déjà tiré, un lien ne doit pas le montrer avant minuit.
  Jamais de tirage depuis un lien.
- Trouvée : `Cache-Control` immuable (une paire tirée ne bouge plus). Introuvable ou base en panne :
  carte sans noms (« Player A / B »), 5 min de cache ; erreur seulement loguée.

e2e (`share.spec.ts`) : texte copié (presse-papiers simulé), gagné et perdu ; le lien ouvre son jour
(passé, aujourd'hui, introuvable) ;
balises de la page ; la carte en base injoignable (200, cache court) ; 404 sur un numéro invalide.

---

## ✅ Bloc 24 terminé — L'id du visiteur survit à Safari (cookie `ipw_vid`)

Un déploiement ne touche pas au stockage du navigateur : le nom et les résultats restaient. Mais
Safari — et tout navigateur iOS, tous WebKit — **efface le `localStorage` d'un site après 7 jours
de navigation sans le visiter** (ITP) : un joueur absent une semaine perdait son id, donc son nom,
ses stats et son classement (toujours en base, devenus injoignables).

- **Un cookie posé par le serveur** (`src/lib/visitorCookie.ts`), pas par `document.cookie` : ITP
  plafonne à 7 jours les cookies écrits par script, pas ceux d'un `Set-Cookie`, et les cookies ne
  sont pas dans la purge. **Pas HttpOnly** exprès : `readVisitor` le lit de façon synchrone, sans
  requête. Même modèle de confiance que le `localStorage`.
- **Posé** par `POST /api/visitor` (réponse avec le nom) ; **prolongé** de 400 jours (le maximum
  d'un navigateur) par le middleware sur `/api/:sport/daily/*` — routes dynamiques, jamais en cache,
  que tout joueur appelle. Un joueur qui revient une fois par an le garde.
- `Domain=iplayedwith.com` sur le site (partagé avec `www.`), sans domaine ailleurs (dev, préviews
  `*.vercel.app` : un navigateur refuse un cookie pour un autre domaine). `Secure` en HTTPS seulement.
- **Lecture** : `readVisitor` prend `localStorage`, à défaut le cookie (recopié dans le stockage,
  **pas** une première visite), à défaut un nouvel id. Le `localStorage` prime toujours.
- **Visiteurs d'avant le cookie** : `useUsername` redemande le nom tant que le cookie manque
  (`hasVisitorCookie`) — c'est cette requête qui le pose. Une fois, puis plus rien.
- **Ne protège pas** : données du site effacées (cookies compris), fenêtre privée, autre appareil
  ou navigateur, préviews Vercel. Ce sera un code de récupération, ou les comptes.
- Revenu par le cookie, un visiteur a perdu `ipw.rulesSeen` et ses plateaux locaux : la pop-up des
  règles se rouvre une fois ; résultats, stats et archives viennent du serveur.
- Cookie strictement nécessaire, first-party, sans pistage : pas de bandeau. La ligne « Vie privée »
  de `/about` le dit.

e2e : `fulfillVisitorName` (`fixtures.ts`) répond au nom **avec** le `Set-Cookie`, comme le serveur.

---

## ✅ Bloc 25 terminé — Retouches : des joueurs, pas des liens

- **Plus de « lien » ni de « chaîne » dans le jeu** : des mots abstraits. On compte des **joueurs** —
  l'intro dit « Meilleure solution : **N** joueurs entre les deux » (`optimalLinks − 1`, toujours ≥ 1),
  le score « 2 joueurs de plus que la meilleure solution », la défaite « Il suffisait de N joueurs entre
  les deux ». Les verbes passent à « relier » / *connect* (règles, carte de partage, descriptions SEO).
  Le code garde `optimalLinks`, `path` : seuls les libellés changent.
- **Menu** : la partie libre et les défis passés le quittent. Ils sont proposés **sous « Commencer »**
  de chaque sport, en deux cartes côte à côte (`daily-intro__more`) — sur un jour passé, la seconde
  devient « Retour aux défis passés ».
- **Barre de fin** : un seul bouton **Résultats**, centré, même style gagné ou perdu. Partager, la
  solution et la suite (défis passés, partie libre, rejouer) vivent dans la pop-up.
- **Classement d'un perdant** : « Votre rang **4ᵉ / 12** », comme un gagnant — le rang partagé par tous
  les perdants (`daily_ranking` le donnait déjà), en rouge. Toujours hors du podium.
- **Partager** : l'icône universelle (trois points reliés, SVG en `currentColor`) remplace « ↗ ».
- **Archives** : un jour fini prend la couleur de son score (celles des stats : Parfait or, +1 vert,
  +2 citron, +3 ambre, +4 orange, +5+ et Perdu rouge) — fond teinté, bordure, pastille pleine. Jamais
  commencé : aucune pastille (Bloc 26) ; en cours : bordure pointillée.

## ✅ Bloc 26 terminé — Joué en retard : compté pour soi, jamais classé

Le classement d'un jour est pour ceux qui l'ont joué **ce jour-là**. En retard, on joue, on finit, ça
compte dans ses stats (pas dans les séries, Bloc 23) — mais on n'apparaît plus dans le classement de ce
jour : ni podium, ni rang, ni total. `YourPlace.rank` est `null` pour un résultat en retard ;
`PodiumEntry` perd `late`. Côté serveur seulement (`toLeaderboard`), sans migration.

**Visuellement moins gratifiant**, exprès :
- **Archives** : un jour fini en retard n'a qu'un **contour** de la couleur de son score, pointillé et
  grisé (pas de fond, pastille en contour désaturée, pas de halo doré), texte estompé, « 🕒 en retard ».
- **Victoire en retard** (`VictoryDialog` `late`) : « Réussi, mais en retard », trophée gris, score gris.
  Le jeu le sait sans le serveur : un jour des archives jamais commencé, ou commencé en retard.
- **Classement** : à la place du rang, une ligne pointillée « Joué en retard — hors du classement de ce jour ».
- Jamais commencé, dans les archives : plus de pastille « À jouer », la ligne seule.

## Tests e2e — jamais la vraie base

Il n'existe qu'**une** base Supabase, la vraie. Les tests e2e n'y touchent jamais :

- **Côté serveur** — Playwright lance **son propre** serveur de dev (port 3100, dossier de build
  `.next-e2e`, jamais un serveur déjà lancé), avec Supabase pointé sur `127.0.0.1:9` : une requête
  qui atteindrait la base échoue tout de suite au lieu de lire la prod — ou d'y tirer un défi du jour.
  Les variables de `playwright.config.ts` priment sur `.env.local`.
- **Côté navigateur** — `tests/e2e/fixtures.ts` intercepte tout `/api/**` : chaque test mocke les
  endpoints attendus (`mockApi`), et un appel non mocké **fait échouer le test**.
- Via `request`, seules les réponses données **avant** la base : routes inconnues, validation.
- Ce que la base calcule (classement de recherche, accents, tirage du défi) relève des tests
  unitaires et des contrôles post-application de chaque migration.

`tsconfig.json` inclut `.next-e2e/types/**/*.ts` : sans cette ligne, Next la rajoute et reformate
le fichier à chaque passage e2e.

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
16. ~~Daily Challenge : une paire par sport et par jour~~
17. Appliquer `013_daily_challenges.sql` **le jour du lancement voulu** (il fixe le #1), puis les
    contrôles en bas du fichier (job planifié, pas de jour manquant, numéros, solution valide,
    fermé à anon) — et noter le temps réel du BFS sur les vraies données
18. ~~Identité du joueur (anonyme d'abord), résultats du défi vérifiés côté serveur~~, ~~classement
    du jour (côté serveur)~~ ; reste : stats perso, empêcher de rejouer le défi
19. ~~Tirage du défi par la fame~~ (bande 60–80, Bloc 16) ; reste : appliquer `019_daily_fame_band.sql`
    et retirer le défi de demain (contrôles en bas du fichier)
20. ~~Accueil : détection de première visite + pop-up des règles~~
21. ~~Menu principal + page À propos~~
22. Formulaire de contact ; dons (plateforme à choisir) ; plateau lisible sur mobile (A et B se
    chevauchent à 390 px)
23. ~~Vies dans le défi du jour~~
24. ~~Révéler la solution du jour~~ (une fois la journée finie côté serveur, Bloc 20) ;
    ~~sauver le plateau en cours~~ ; ajuster les vies à la distance si les longs jours s'avèrent durs
25. ~~Fame v2 — caps seniors uniquement + caps par saison (revision 2)~~
26. `014_fame_rate.sql` appliqué — reste à relancer, depuis le checkout qui a le cache des
    profils, `npm run seed:fame` (re-parse les caps rugby) et
    `npm run fame:compute -- --sport=football`, puis lire le top/bottom 30 et la section *Floors*
27. ~~Prestige de club (revision 3)~~ — remplacé par la fame v3 à quatre piliers (étape 37)
28. ~~Spike Wikidata~~ — fait : vues Wikipedia fr + en par ID partagé (`fame:exposure`)
29. Appliquer `015_daily_results.sql` (contrôles en bas du fichier), jouer quelques jours, lire
    `npm run daily:ranking` — ~~puis afficher le classement aux joueurs~~ (podium + rang, Bloc 22)
30. ~~Vrai score du défi~~ (joueurs en trop, Bloc 19) ; reste : trancher la fame des joueurs de la
    chaîne (simuler départage vs bonus sur les chaînes stockées), ~~grille de partage~~ (Bloc 24)
31. Appliquer `016_daily_hints.sql` après `015` ; puis faire entrer les indices dans le vrai score
    (badge « sans indice » ou bonus), et envisager un indice plus fort payant (« un coéquipier de
    X chez C en S », contre une vie) pour les joueurs vraiment bloqués
32. Appliquer `017_visitors.sql` ; ~~puis afficher le classement du jour aux joueurs~~ (Bloc 22)
33. ~~Comptes~~ — plus prévus pour l’instant, le visiteur anonyme suffit (Bloc 22) ; reste : filtre de mots des
    pseudos (FR/EN, leetspeak, noms de vrais joueurs), maintenant que le podium est public
34. ~~Carte de partage par défi~~ (`/[sport]/[n]`, Bloc 24) ; reste : un aperçu avec le résultat
    perso (paramètres d'URL, falsifiables) si le texte seul ne suffit pas
34. Appliquer `018_visitor_number.sql` (après `017`) et ses contrôles
35. ~~Appliquer `020_visitor_username.sql`~~ ; appliquer `021_visitor_rename.sql` (le renommage
    échoue en prod tant qu'il manque), puis ses contrôles
36. Appliquer `022_daily_score.sql` **avant** le déploiement, puis ses contrôles ; après quelques
    jours, lire `npm run daily:ranking` (colonne `chain u/k/f`) pour décider de la fame
37. ~~Fame v3 : `023` → `025` appliqués, imports des deux sports passés (`seed:fame`, `seed:prestige`,
    `fame:exposure`)~~ ; reste : revoir les paliers 70 / 30 et la bande du tirage 60-80 sur la
    nouvelle échelle (famous : 119 rugby, 201 football)
38. Awards en multiplicateur d'exposition (liste curée : joueur de l'année, équipes types…) ; vues
    des autres langues ; biais des gardiens (100 % des minutes) dans le pilier club
39. Référencement + supervision (Bloc 21) : faire les 4 étapes hors code, puis suivre Search Console
    (requêtes « i played with », pages indexées) et ajouter des liens vers le site
40. Appliquer `026_daily_archive.sql` **avant** de déployer les archives, puis ses contrôles ; lire
    `npm run daily:ranking -- --day=…` sur un jour joué en retard (colonne `late`)
