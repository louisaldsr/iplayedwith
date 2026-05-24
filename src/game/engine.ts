import { PlayerId, ClubId } from '../domain/ids'
import { Season } from '../domain/season'
import { Player } from '../domain/player'
import { Membership } from '../domain/membership'
import { Game, DifficultyLevel } from './game'
import { MembershipIndex } from './membershipIndex'
import { GraphBuilder, playerKey, clubKey } from './graphBuilder'

/** A move submitted by the user. Easy mode requires only a player; hard mode also requires the linking club and season. */
export type UserInput =
  | { kind: 'easy'; playerId: PlayerId }
  | { kind: 'hard'; playerId: PlayerId; clubId: ClubId; season: Season }

/** The result of processing a user move. On failure, `reason` is a human-readable message. */
export type InputResult =
  | { ok: true; game: Game }
  | { ok: false; reason: string }

/**
 * The public interface of a running game session.
 *
 * `game` holds the full mutable state (nodes, edges, path).
 * `addInput` is the single entry point for user moves.
 * `isVictory` returns true as soon as playerA and playerB are connected in the graph.
 */
export type GameEngine = {
  readonly game: Game
  addInput(input: UserInput): InputResult
  isVictory(): boolean
}

/**
 * BFS over the bipartite (player ↔ club:season) graph.
 *
 * Traverses the graph by alternating between player nodes and (club, season)
 * nodes. Because club node identity encodes the season, each hop through a
 * club node implicitly enforces the "same season" constraint — no extra
 * filtering is needed during traversal.
 *
 * @returns The shortest player-only sequence from `fromId` to `toId`,
 *          or `null` if the two players are not yet connected.
 */
function bfsPath(
  nodes: Map<string, unknown>,
  edges: { playerId: PlayerId; clubId: ClubId; season: Season }[],
  fromId: PlayerId,
  toId: PlayerId
): PlayerId[] | null {
  const startKey = playerKey(fromId)
  const targetKey = playerKey(toId)
  if (!nodes.has(startKey) || !nodes.has(targetKey)) return null

  const adj = new Map<string, string[]>()
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }
  for (const e of edges) {
    addEdge(playerKey(e.playerId), clubKey(e.clubId, e.season))
  }

  const prev = new Map<string, string>()
  const queue: string[] = [startKey]
  prev.set(startKey, startKey)

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === targetKey) break
    for (const neighbor of adj.get(current) ?? []) {
      if (!prev.has(neighbor)) {
        prev.set(neighbor, current)
        queue.push(neighbor)
      }
    }
  }

  if (!prev.has(targetKey)) return null

  // Reconstruct full path, then keep only player nodes.
  const fullPath: string[] = []
  let cur = targetKey
  while (cur !== prev.get(cur)) {
    fullPath.unshift(cur)
    cur = prev.get(cur)!
  }
  fullPath.unshift(cur)

  return fullPath
    .filter(k => k.startsWith('player:'))
    .map(k => k.slice('player:'.length) as PlayerId)
}

/**
 * Creates and returns a new game engine for a single session.
 *
 * Both `playerA` and `playerB` are seeded into the graph at creation time —
 * the user builds intermediate connections between them in any order.
 *
 * Each call to `addInput` validates the move, expands the graph, and updates
 * `game.path` with the BFS solution as soon as A and B become connected.
 *
 * @param playerA   - The starting endpoint of the puzzle.
 * @param playerB   - The target endpoint of the puzzle.
 * @param difficulty - Controls what information the user must supply per move.
 * @param memberships - The full membership dataset used for validation and graph expansion.
 */
export function createEngine(
  playerA: Player,
  playerB: Player,
  difficulty: DifficultyLevel,
  memberships: Membership[]
): GameEngine {
  const index = new MembershipIndex(memberships)

  const game: Game = {
    playerA,
    playerB,
    difficulty,
    nodes: new Map(),
    edges: [],
    path: [],
    startedAt: new Date(),
  }

  const builder = new GraphBuilder(index, game.nodes, game.edges)

  builder.addPlayer(playerA.id)
  builder.addPlayer(playerB.id)

  const initialPath = bfsPath(game.nodes, game.edges, playerA.id, playerB.id)
  if (initialPath) game.path = initialPath

  /** Returns true when A and B are connected in the game graph. */
  function isVictory(): boolean {
    return bfsPath(game.nodes, game.edges, playerA.id, playerB.id) !== null
  }

  /**
   * Processes a user move.
   *
   * Guard order:
   * 1. Game already won → refuse.
   * 2. Player already in graph → refuse (edges already fully wired).
   * 3. Easy: new player must share at least one (club, season) with an existing graph node.
   *    Hard: the explicit (club, season) must already be in the graph AND belong to the new player.
   * 4. Expand graph via `GraphBuilder.addPlayer`.
   * 5. Run BFS — if A and B are now connected, populate `game.path`.
   */
  function addInput(input: UserInput): InputResult {
    if (isVictory()) {
      return { ok: false, reason: 'La partie est déjà terminée.' }
    }

    const newPlayerId = input.playerId

    if (builder.hasPlayer(newPlayerId)) {
      return { ok: false, reason: 'Ce joueur est déjà dans le graphe.' }
    }

    if (input.kind === 'easy') {
      const connects = index
        .getByPlayer(newPlayerId)
        .some(m => builder.hasClub(m.clubId, m.season))

      if (!connects) {
        return { ok: false, reason: "Ce joueur ne partage aucun club/saison avec les joueurs déjà dans le graphe." }
      }
    } else {
      const { clubId, season } = input
      if (!builder.hasClub(clubId, season)) {
        return { ok: false, reason: "Aucun joueur dans le graphe n'a joué dans ce club cette saison." }
      }
      if (!index.hasExact(newPlayerId, clubId, season)) {
        return { ok: false, reason: "Ce joueur n'a pas joué dans ce club cette saison." }
      }
    }

    builder.addPlayer(newPlayerId)

    const solution = bfsPath(game.nodes, game.edges, playerA.id, playerB.id)
    if (solution) game.path = solution

    return { ok: true, game }
  }

  return { game, addInput, isVictory }
}
