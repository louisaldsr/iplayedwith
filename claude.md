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

## ✅ Bloc 5 terminé — Fame des joueurs (T1)

`findRandom` tirait uniformément sur toute la table : une partie pouvait opposer deux
inconnus parmi 7 823 joueurs de rugby ou 11 455 de football. Chaque joueur porte désormais
une **fame**, rafraîchie à chaque import.

> Le nom : *notoriety* en anglais est péjoratif (on est « notorious » pour une mauvaise
> raison) — faux ami du français *notoriété*. Le mot juste est **fame**.

### Stockage

```
players.fame_details  jsonb   — les ENTRÉES brutes, ouvertes (un signal de plus = pas de migration)
players.fame          integer — la SORTIE dérivée, 0..100, GÉNÉRÉE, indexée (sport, fame)
```

`fame` est une **colonne générée** : écrire `fame_details` la recalcule dans la même
instruction. Plus d'étape de recalcul à oublier, plus d'ordre à respecter. C'est possible
uniquement parce que le score est absolu (voir ci-dessous). `fame` vaut **NULL** tant qu'aucun
import n'a écrit — à distinguer de 0, « calculé et tout en bas ».

Garder le score dans le jsonb exposerait un piège PostgREST réel : `.gte('fame->>score', 70)`
compare des **chaînes**, donc `"9" > "70"`.

### La formule — absolue, pas un rang centile

```
fame = round(100 × [ 0.35·s(gamesPlayed, Kg) + 0.45·s(caps, Kc) + 0.20·s(gamesPlayed/seasons, Ki) ])
s(x, K) = min(1, √(x / K))
```

Le centile de la v1 rendait le score fonction de la **cohorte** : ajouter 500 joueurs déplaçait
tout le monde, un daily challenge n'était plus reproductible, et 68 % des joueurs à 0 sélection
tenaient tous le centile 0 — signal détruit. En absolu, corriger un joueur à la main ne déplace
le score de personne d'autre.

`s` donne des **rendements décroissants** : avec Kg=300, les 40 premiers matchs rapportent 0.37
et les 160 suivants 0.45. Constantes **par sport** (rugby = carrière entière, football = Big-5
depuis 2012) : Kg 300/600, Kc 100/180, Ki 28/45.

Les poids sont des **a priori, pas un ajustement** — il n'existe aucune vérité terrain dans les
données. Le futur signal `appearance` (combien de fois un joueur est cherché) fournira enfin des
étiquettes pour les ajuster.

### Les signaux

| | rugby | football |
|---|---|---|
| `gamesPlayed` | colonne **Matchs** du profil, toutes compétitions | une ligne d'`appearances.csv` par match |
| `caps` | lignes `class="international"` du même tableau | colonne `international_caps` |
| `seasons` | dérivé de `memberships` par `refresh_fame_seasons()` — **diviseur**, pas terme additif | idem |

Les deux premiers étaient déjà sur le disque et jetés au dernier moment. Côté rugby,
`parseCareerRows` a été refactorisé autour d'un `walkCareerTable` commun — sortie **identique
sur les 20 677 profils en cache, 0 différence**, zéro requête réseau. Côté football, le comptage
roule sur le même passage que les memberships, avec les mêmes filtres de périmètre.

`seasons` n'est **pas** un terme additif : `corr(gamesPlayed, seasons) = 0.933`, ce serait
compter les matchs deux fois. Mais `gamesPlayed / seasons` (titulaire ou rotation) est un vrai
signal — à matchs égaux, le quartile le plus intense a 1,8 à 2,5 fois plus de sélections.
`clubs` a été testé et écarté (effet non monotone, nul une fois le volume retiré).

### Limite mesurée

Le classement suit la **longévité**, pas la célébrité : Antoine Dupont sort à 81, derrière Uini
Atonio à 89. Aucune pondération de ces trois signaux ne l'inverse — sur ces chiffres, Atonio est
réellement devant. Seul `appearance` corrigerait ça. Détail :
[docs/spikes/fame.md](docs/spikes/fame.md).

### Ordre d'import

Les étapes de fame viennent **en dernier** : `refresh_fame_seasons()` lit `memberships`, donc la
lancer sur une table vide laisse tout le monde à `seasons: 0` et supprime le terme d'intensité.

```
rugby    : seed:map-players → seed:players → seed:memberships → seed:fame
football : seed:football:fetch → :build → :clubs → :players → :memberships → :fame
contrôle : npm run fame:report -- --sport=rugby
```

`fame:report` est le seul lecteur du score aujourd'hui : distribution, couverture, lignes non
rafraîchies, et top/bottom 30 **nominatif**. C'est ce qui permet de juger le classement avant
que le jeu en dépende — les déciles seuls ne distinguent pas un bon classement d'un mauvais.

⚠️ **Changer la formule** impose `ALTER TABLE players DROP COLUMN fame` d'abord. Postgres
accepte un `CREATE OR REPLACE` de `compute_fame()` sans rien dire, ne recalcule pas les valeurs
stockées, mais applique la nouvelle formule aux lignes réécrites ensuite — la table part en état
mixte silencieux. Séquence complète en bas de `010_player_fame.sql`.

### Formatage

Prettier est branché sur tout le projet (`npm run format`, `format:check`), configuré sur le
style existant : sans point-virgule, guillemets simples, `printWidth: 120` (mesuré — les lignes
du repo sont à p99=110).

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
10. ~~Métrique de fame (T1) — signaux, score absolu en colonne générée, CLI de contrôle~~
11. Appliquer `010_player_fame.sql`, puis les deux étapes `:fame` — et **lire le top/bottom 30**
    avant de brancher quoi que ce soit dessus
12. Brancher la fame : bande de tirage sur `findRandom`, puis daily challenge, puis points
13. Remonter `source` / `sourceUrl` dans `Player` (retirés du sac de fame) — permettrait aussi
    d'envoyer l'utilisateur vers la fiche d'origine du joueur depuis le jeu
14. Le signal `appearance` (combien de fois un joueur est cherché), quand le jeu produira des
    parties — c'est lui qui donnera enfin des étiquettes pour ajuster les poids de la fame