import { PlayerId } from '../domain/ids'
import { Player } from '../domain/player'
import { GameNode } from '../graph/node'
import { GameEdge } from '../graph/edge'

/** Controls which information the user must supply per move. */
export type DifficultyLevel = 'easy' | 'hard'

/**
 * The full runtime state of a game session.
 *
 * `nodes` and `edges` represent the bipartite graph built as the user makes
 * moves — both are mutated in place by the engine.
 *
 * `path` is empty while the puzzle is unsolved; once A and B become connected
 * it holds the BFS shortest player-only sequence from playerA to playerB.
 */
export type Game = {
  playerA: Player
  playerB: Player
  difficulty: DifficultyLevel
  nodes: Map<string, GameNode>
  edges: GameEdge[]
  path: PlayerId[]
  startedAt: Date
}
