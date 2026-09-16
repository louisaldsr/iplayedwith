import { PlayerId, ClubId } from '../domain/ids'
import { Season } from '../domain/season'

/**
 * A move submitted by the user.
 *
 * Easy mode takes a player alone — the engine resolves the shared club/season itself.
 * Hard mode makes the user name each step: a player, or a club:season.
 *
 * Lives apart from the engine so the move rules, the engine and the server-side move
 * handler can all share it without importing each other.
 */
export type UserInput =
  | { kind: 'easy'; playerId: PlayerId }
  | { kind: 'hard-player'; playerId: PlayerId }
  | { kind: 'hard-club'; clubId: ClubId; season: Season }
