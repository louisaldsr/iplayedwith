import { PlayerId, ClubId } from '../domain/ids'
import { Season } from '../domain/season'
import { Player } from '../domain/player'
import { Membership } from '../domain/membership'
import { Game, DifficultyLevel } from './game'
import { MembershipIndex } from './membershipIndex'
import { GraphBuilder, playerKey } from './graphBuilder'

/** A move submitted by the user. */
export type UserInput =
  | { kind: 'easy';        playerId: PlayerId }
  | { kind: 'hard-player'; playerId: PlayerId }
  | { kind: 'hard-club';   clubId: ClubId; season: Season }

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
 * Returns true if playerA and playerB share at least one (club, season) —
 * i.e. they have already played together. Used to block easy-mode starts
 * where the link would be trivially auto-resolved.
 */
export function areDirectlyConnected(
  playerA: Player,
  playerB: Player,
  memberships: Membership[]
): boolean {
  const index = new MembershipIndex(memberships)
  return index.findShared(playerA.id, playerB.id).length > 0
}

/**
 * BFS over the (player ↔ club:season) graph using internal season-scoped keys.
 * Works for both easy mode (no club nodes, edges only) and hard mode (full bipartite).
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

  const bfsClubKey = (id: ClubId, season: Season) => `bfs:${id}:${season}`

  const adj = new Map<string, string[]>()
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }
  for (const e of edges) {
    addEdge(playerKey(e.playerId), bfsClubKey(e.clubId, e.season))
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

  const builder = new GraphBuilder(index, game.nodes, game.edges, difficulty)

  builder.addPlayerNode(playerA.id)
  builder.addPlayerNode(playerB.id)

  function isVictory(): boolean {
    return bfsPath(game.nodes, game.edges, playerA.id, playerB.id) !== null
  }

  function addInput(input: UserInput): InputResult {
    if (isVictory()) {
      return { ok: false, reason: 'La partie est déjà terminée.' }
    }

    if (input.kind === 'easy') {
      const newPlayerId = input.playerId
      if (builder.hasPlayer(newPlayerId)) {
        return { ok: false, reason: 'Ce joueur est déjà dans le graphe.' }
      }
      const existingPlayers = builder.getPlayerIds()
      const connects = index
        .getByPlayer(newPlayerId)
        .some(m => [...existingPlayers].some(pid => index.hasExact(pid, m.clubId, m.season)))
      if (!connects) {
        return { ok: false, reason: "Ce joueur ne partage aucun club/saison avec les joueurs déjà dans le graphe." }
      }
      builder.addPlayer(newPlayerId)
    }

    else if (input.kind === 'hard-player') {
      const newPlayerId = input.playerId
      if (builder.hasPlayer(newPlayerId)) {
        return { ok: false, reason: 'Ce joueur est déjà dans le graphe.' }
      }
      const connects = index
        .getByPlayer(newPlayerId)
        .some(m => builder.hasClub(m.clubId, m.season))
      if (!connects) {
        return { ok: false, reason: "Ce joueur ne joue dans aucun club/saison déjà présent dans le graphe." }
      }
      builder.addPlayer(newPlayerId)
    }

    else {
      const { clubId, season } = input
      if (builder.hasClub(clubId, season)) {
        return { ok: false, reason: 'Ce club/saison est déjà dans le graphe.' }
      }
      const existingPlayers = builder.getPlayerIds()
      const connects = [...existingPlayers].some(pid => index.hasExact(pid, clubId, season))
      if (!connects) {
        return { ok: false, reason: "Aucun joueur du graphe n'a joué dans ce club cette saison." }
      }
      builder.addClubSeasonNode(clubId, season)
    }

    const solution = bfsPath(game.nodes, game.edges, playerA.id, playerB.id)
    if (solution) game.path = solution

    return { ok: true, game }
  }

  return { game, addInput, isVictory }
}
