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

Domaine (TypeScript)
  → objets validés, IDs brandés, smart constructors

Game/Graph (client-only)
  → GameNode, GameEdge, GameEngine
  → jamais persisté côté serveur
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

## Travail en cours — Bloc 3 : GameEngine

### Responsabilités

- Construire le graphe bipartite joueurs ↔ clubs à partir des `Membership[]`
- Exposer `addInput(input: UserInput): Result` qui valide et insère un lien
- Valider qu'un lien s'insère dans le chemin courant (Membership commun entre le dernier nœud et le nouveau)
- Détecter la victoire (chemin A → B complet)

### Interface cible

```ts
// src/game/engine.ts
type UserInput =
  | { kind: 'easy'; playerId: PlayerId }
  | { kind: 'hard'; playerId: PlayerId; clubId: ClubId; season: Season }

type InputResult =
  | { ok: true;  game: Game }
  | { ok: false; reason: string }

type GameEngine = {
  game: Game
  addInput(input: UserInput): InputResult
  isVictory(): boolean
}

function createEngine(playerA: Player, playerB: Player, difficulty: DifficultyLevel, memberships: Membership[]): GameEngine
```

### Logique de validation

```
addInput(input)
  → résoudre le Membership commun entre dernier nœud du chemin et le joueur soumis
     - mode easy  : chercher dans memberships[] un club commun (n'importe quelle saison)
     - mode hard  : vérifier que le Membership exact (playerId, clubId, season) existe
  → si trouvé  : addNode + addEdge dans game.nodes / game.edges → retourner { ok: true }
  → si absent  : retourner { ok: false, reason: "..." }
  → après chaque ajout : vérifier isVictory()
```

---

## Flux de validation (pour branchement UI futur)

```
Saisie user
  → [UI] format/type check (string, format Season YYYY-YYYY)
  → [API] POST /validate-input → résout Player/Club/Membership, retourne l'objet domaine ou 404
  → [GameEngine] addInput() → valide le lien dans le chemin courant
  → OK → addNode + addEdge dans Game
  → KO → erreur "tentative erronée" affichée au user
```

L'autocomplétion est du confort UX uniquement — elle ne pré-résout pas l'objet domaine.

---

## Prochaines étapes dans l'ordre

1. ~~Créer les fichiers domaine~~
2. ~~Créer le mock data~~
3. **Écrire le GameEngine** (`src/game/engine.ts`) — construction du graphe + `addInput()` + détection victoire
4. Brancher l'UI React après