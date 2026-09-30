/**
 * Why a move was refused, as a code the client can act on — the message alone cannot be.
 *
 * The daily challenge costs a life only for `not-connected`: the player guessed a link that does
 * not exist. The others are not wrong guesses — a player already on the board, a move of the
 * other difficulty, a game already won — and must never cost one.
 */
export type MoveRejectionCode = 'not-connected' | 'already-on-board' | 'wrong-kind' | 'game-over'

export type MoveRejection = {
  code: MoveRejectionCode
  /** Human-readable, in French — kept for logs and older clients; the UI translates the code. */
  reason: string
}

export const rejection = (code: MoveRejectionCode, reason: string): MoveRejection => ({ code, reason })
