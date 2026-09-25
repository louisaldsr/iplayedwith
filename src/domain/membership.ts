import { ClubId, PlayerId } from './ids'
import { Season } from './season'

/** Records that a player belonged to a club for a given season. */
export type Membership = {
  playerId: PlayerId
  clubId: ClubId
  season: Season
  competition?: string
  /**
   * Matches the player played FOR THIS CLUB, IN THIS SEASON, all competitions combined.
   *
   * `null` when the source does not say — not the same as 0, which means he was in the squad
   * and did not play. How a source is read to produce this number is its import script's
   * business; everything downstream (fame included) only ever sees this contract.
   */
  games?: number | null
}
