import { Player } from '../domain/player'
import { Membership } from '../domain/membership'
import { Game, DifficultyLevel } from './game'
import { MembershipIndex } from './membershipIndex'
import { GraphBuilder } from './graphBuilder'
import { applyMove } from './moveRules'
import { bfsPlayerPath } from './path'
import { UserInput } from './userInput'

// The equivalent of the old `areDirectlyConnected` now lives server-side as
// `validateService.validateConnection` — the client has no membership list to check.

export type { UserInput }

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
 * An in-memory engine over a complete membership list.
 *
 * The game no longer runs this in the browser — that meant shipping every membership for
 * the sport, which is what made starting a game slow. It is kept as the reference
 * implementation of the rules: its test suite is the widest coverage of `applyMove` and
 * `bfsPlayerPath`, which the server's move handler runs in production.
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

  const builder = new GraphBuilder(index, game.nodes, game.edges, difficulty)

  builder.addPlayerNode(playerA.id)
  builder.addPlayerNode(playerB.id)

  function isVictory(): boolean {
    return bfsPlayerPath(game.nodes, game.edges, playerA.id, playerB.id) !== null
  }

  function addInput(input: UserInput): InputResult {
    if (isVictory()) {
      return { ok: false, reason: 'La partie est déjà terminée.' }
    }

    const rejection = applyMove(builder, index, input, difficulty)
    if (rejection) return { ok: false, reason: rejection }

    const solution = bfsPlayerPath(game.nodes, game.edges, playerA.id, playerB.id)
    if (solution) game.path = solution

    return { ok: true, game }
  }

  return { game, addInput, isVictory }
}
