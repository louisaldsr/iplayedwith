import { MembershipIndex } from './membershipIndex'
import { GraphBuilder } from './graphBuilder'
import { DifficultyLevel } from './game'
import { UserInput } from './userInput'
import { MoveRejection, rejection } from './moveRejection'

/**
 * Whether a move may be played, and if so, applying it.
 *
 * Shared by the two callers that must agree exactly: the in-memory `GameEngine` and the
 * server's `applyMove`. Keeping one implementation is what lets the server reuse the
 * engine's semantics rather than reimplementing (and slowly diverging from) them.
 *
 * Returns why the move is refused, or null after mutating the graph through `builder`.
 */
export function applyMove(
  builder: GraphBuilder,
  index: MembershipIndex,
  input: UserInput,
  difficulty: DifficultyLevel,
): MoveRejection | null {
  const kindMismatch = checkKindMatchesDifficulty(input, difficulty)
  if (kindMismatch) return kindMismatch

  if (input.kind === 'easy' || input.kind === 'hard-player') {
    const newPlayerId = input.playerId
    if (builder.hasPlayer(newPlayerId)) {
      return rejection('already-on-board', 'Ce joueur est déjà dans le graphe.')
    }

    if (input.kind === 'easy') {
      // Easy mode has no club nodes, so the new player must share a (club, season) with
      // a player already in the graph.
      const existingPlayers = builder.getPlayerIds()
      const connects = index
        .getByPlayer(newPlayerId)
        .some((m) => [...existingPlayers].some((pid) => index.hasExact(pid, m.clubId, m.season)))
      if (!connects) {
        return rejection(
          'not-connected',
          'Ce joueur ne partage aucun club/saison avec les joueurs déjà dans le graphe.',
        )
      }
    } else {
      // Hard mode connects players through club nodes, which must already be on the board.
      const connects = index.getByPlayer(newPlayerId).some((m) => builder.hasClub(m.clubId, m.season))
      if (!connects) {
        return rejection('not-connected', 'Ce joueur ne joue dans aucun club/saison déjà présent dans le graphe.')
      }
    }

    builder.addPlayer(newPlayerId)
    return null
  }

  const { clubId, season } = input
  if (builder.hasClub(clubId, season)) {
    return rejection('already-on-board', 'Ce club/saison est déjà dans le graphe.')
  }
  const existingPlayers = builder.getPlayerIds()
  const connects = [...existingPlayers].some((pid) => index.hasExact(pid, clubId, season))
  if (!connects) {
    return rejection('not-connected', "Aucun joueur du graphe n'a joué dans ce club cette saison.")
  }

  builder.addClubSeasonNode(clubId, season)
  return null
}

/**
 * Rejects a move whose kind belongs to the other difficulty.
 *
 * The UI never produces a mismatch, but the server accepts moves from the browser, where
 * submitting a `hard-club` move into an easy game would otherwise sidestep easy mode's
 * stricter "must share a club-season with an existing player" rule.
 */
function checkKindMatchesDifficulty(input: UserInput, difficulty: DifficultyLevel): MoveRejection | null {
  const isEasyKind = input.kind === 'easy'
  if (difficulty === 'easy' && !isEasyKind) {
    return rejection('wrong-kind', 'Ce type de coup est réservé au mode difficile.')
  }
  if (difficulty === 'hard' && isEasyKind) {
    return rejection('wrong-kind', 'Ce type de coup est réservé au mode facile.')
  }
  return null
}
