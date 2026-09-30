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
| `ipw.playerId` | UUID anonyme, créé à la première visite. Envoyé avec « Commencer » et chaque coup du défi du jour : c'est sous cet id que le serveur tient le résultat (Bloc 11) |
| `ipw.rulesSeen` | version des règles lue et fermée |
| `ipw.daily.<sport>` | `{ day, livesLeft, outcome?, board? }` du dernier défi joué dans ce sport (`src/lib/dailyProgress.ts`) — vies restantes, plateau en cours, et `won`/`lost` une fois fini ; le menu colore la carte tant que c'est aujourd'hui (Paris) ; périme seul à minuit |

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

- **partie libre** par sport en lien secondaire ;
- **Comment jouer** (ouvre la pop-up des règles) et **À propos**.
- **Bientôt** : Classement, Mes stats, Connexion — affichés désactivés pour que le menu ait déjà sa
  forme finale ; ils arriveront avec l'identité (étape 17).
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
restent) ; gagné, il est gardé avec sa chaîne (voir Bloc 10) ; perdu, il est jeté. **Contournable** en effaçant les données du site — la vraie garantie
viendra des résultats stockés côté serveur (étape 17).

**Pas de solution affichée** en cas de défaite : le serveur la garde, mais sans compte rien ne
dit qui a vraiment perdu — l'exposer, c'est la donner à tout le monde avant de jouer.

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
alors la saisie (`won-bar` : « Chaîne complète — N liens », Résultats pour la rouvrir, Partie libre
ou Rejouer). Le chrono s'arrête au coup gagnant (`finishedAt`), le temps affiché ne dérive plus.

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
viennent du serveur. Pas encore d'écran : lecture par `npm run daily:ranking -- --sport=rugby
[--day=YYYY-MM-DD]`.

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
| `POST /api/:sport/daily/start` | `{ day, visitorId }` → 204 ; horodate le départ (idempotent), 409 si `day` n'est plus aujourd'hui |

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
- `POST /api/:sport/daily/hint` `{ day, visitorId, playerId }` → 204 ; 409 si `day` périmé.
- **Pas un indice** : A et B (l'intro les montre, tout le monde en a besoin), une carrière ouverte
  après la fin du jour (ligne figée), la partie libre.
- Sur parole : `/api/players/:id/career` est public, une lecture directe n'est pas comptée — pas
  plus qu'une recherche Google.

---

## ✅ Bloc 13 terminé — Visiteurs et noms générés

Le classement affiche un **nom généré** au lieu d'un UUID : un adjectif et un poste/rôle tirés de
listes curatées (`src/domain/visitorName.ts`) — « Pilier Pressé », « Hasty Prop ». 40 × 28 = 1 120
noms ; deux visiteurs peuvent partager un nom.

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
19. Tirage du défi pondéré par la fame (`player_fame.score`, v1), une fois `012` appliqué et le
    top/bottom 30 validé
20. ~~Accueil : détection de première visite + pop-up des règles~~
21. ~~Menu principal + page À propos~~
22. Formulaire de contact ; dons (plateforme à choisir) ; plateau lisible sur mobile (A et B se
    chevauchent à 390 px)
23. ~~Vies dans le défi du jour~~
24. Révéler la solution du jour — le lendemain, ou après une défaite vérifiée côté serveur ;
    ~~sauver le plateau en cours~~ ; ajuster les vies à la distance si les longs jours s'avèrent durs
25. ~~Fame v2 — caps seniors uniquement + caps par saison (revision 2)~~
26. `014_fame_rate.sql` appliqué — reste à relancer, depuis le checkout qui a le cache des
    profils, `npm run seed:fame` (re-parse les caps rugby) et
    `npm run fame:compute -- --sport=football`, puis lire le top/bottom 30 et la section *Floors*
27. Prestige de club (revision 3), puis trancher les seuils 70 / 30 une seule fois
28. Spike **Wikidata sitelinks** (nombre d'éditions Wikipédia d'un joueur) : le signal de
    notoriété médiatique qui manque (Dupont derrière Kinghorn) — football via l'ID Transfermarkt,
    rugby par rapprochement de noms
29. Appliquer `015_daily_results.sql` (contrôles en bas du fichier), jouer quelques jours, lire
    `npm run daily:ranking` — puis afficher le classement aux joueurs
30. Vrai score du défi : tentatives, temps, vies restantes, fame des joueurs trouvés
31. Appliquer `016_daily_hints.sql` après `015` ; puis faire entrer les indices dans le vrai score
    (badge « sans indice » ou bonus), et envisager un indice plus fort payant (« un coéquipier de
    X chez C en S », contre une vie) pour les joueurs vraiment bloqués
32. Appliquer `017_visitors.sql` ; puis afficher le classement du jour aux joueurs (noms, sa
    propre ligne en évidence)
33. Comptes (lien magique Supabase) : réclamer le visiteur, pseudo libre + sa modération
