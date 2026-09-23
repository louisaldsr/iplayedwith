import { Player } from '../domain/player'
import { Club } from '../domain/club'
import { PlayerId, ClubId } from '../domain/ids'
import { Season } from '../domain/season'
import { SportId } from '../domain/sport'
import { Game, DifficultyLevel } from './game'
import { GameNode } from '../graph/node'
import { GameEdge } from '../graph/edge'
import { playerKey, clubKey } from './graphBuilder'
import { UserInput } from './userInput'

/** Mirrors the server's `ResolvedNode` — the node a move added, with its display data. */
type ResolvedNode =
  | { kind: 'player'; player: Player }
  | { kind: 'club'; club: Club; season: Season }

type MoveResponse =
  | { ok: true; node: ResolvedNode; edges: GameEdge[]; clubs: Club[]; victory: boolean; path: PlayerId[] }
  | { ok: false; reason: string }

export type RemoteInputResult =
  | { ok: true; game: Game; players: Player[]; clubs: Club[] }
  | { ok: false; reason: string }

/**
 * Client-side driver for the server-authoritative game.
 *
 * Holds the graph locally — it is only a handful of nodes — and sends it with each move
 * for the server to validate and extend. The rules and the membership data live entirely
 * on the server, so the browser never receives the dataset and the solution cannot be
 * read out of devtools.
 *
 * `players` and `clubs` accumulate the entities the board needs to render, one per move,
 * replacing the full rosters the game used to download up front.
 */
export type RemoteEngine = {
  readonly game: Game
  readonly players: Player[]
  readonly clubs: Club[]
  addInput(input: UserInput): Promise<RemoteInputResult>
  isVictory(): boolean
}

export function createRemoteEngine(
  sport: SportId,
  playerA: Player,
  playerB: Player,
  difficulty: DifficultyLevel,
): RemoteEngine {
  const nodes = new Map<string, GameNode>([
    [playerKey(playerA.id), { kind: 'player', id: playerA.id }],
    [playerKey(playerB.id), { kind: 'player', id: playerB.id }],
  ])

  const game: Game = {
    playerA,
    playerB,
    difficulty,
    nodes,
    edges: [],
    path: [],
    startedAt: new Date(),
  }

  const players: Player[] = [playerA, playerB]
  const clubs: Club[] = []
  let victory = false

  function serializeGraph() {
    const playerIds: string[] = []
    const clubNodes: { id: string; season: string }[] = []
    for (const node of game.nodes.values()) {
      if (node.kind === 'player') playerIds.push(node.id)
      else clubNodes.push({ id: node.id, season: node.season })
    }
    return { players: playerIds, clubs: clubNodes, edges: game.edges }
  }

  async function addInput(input: UserInput): Promise<RemoteInputResult> {
    if (victory) {
      return { ok: false, reason: 'La partie est déjà terminée.' }
    }

    const res = await fetch(`/api/${sport}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerAId: playerA.id,
        playerBId: playerB.id,
        difficulty,
        graph: serializeGraph(),
        move: input,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return { ok: false, reason: body?.error ?? 'Une erreur est survenue. Réessayez.' }
    }

    const result: MoveResponse = await res.json()
    if (!result.ok) return { ok: false, reason: result.reason }

    applyNode(result.node)
    mergeClubs(result.clubs)
    game.edges.push(...result.edges)
    game.path = result.path
    victory = result.victory

    // New array identities so React sees the change; `game` is mutated in place, matching
    // what the in-memory engine did and what GamePage's reducer expects.
    return { ok: true, game, players: [...players], clubs: [...clubs] }
  }

  /**
   * Keeps every club an edge refers to, not just the ones that became nodes.
   *
   * Easy mode never adds a club node, but the board names the (club, season) behind an edge
   * when it is opened — without these the popup would fall back to the raw club id.
   */
  function mergeClubs(incoming: Club[]): void {
    for (const club of incoming) {
      const id = ClubId(club.id)
      if (!clubs.some((c) => c.id === id)) clubs.push(club)
    }
  }

  function applyNode(node: ResolvedNode): void {
    if (node.kind === 'player') {
      const id = PlayerId(node.player.id)
      nodes.set(playerKey(id), { kind: 'player', id })
      if (!players.some((p) => p.id === id)) players.push(node.player)
      return
    }

    const id = ClubId(node.club.id)
    nodes.set(clubKey(id, node.season), { kind: 'club', id, season: node.season })
    if (!clubs.some((c) => c.id === id)) clubs.push(node.club)
  }

  return {
    game,
    get players() {
      return players
    },
    get clubs() {
      return clubs
    },
    addInput,
    isVictory: () => victory,
  }
}
