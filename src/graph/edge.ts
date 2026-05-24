import { PlayerId, ClubId } from '../domain/ids'
import { Season } from '../domain/season'

/** An edge in the game graph linking a player to a (club, season) node. Mirrors a Membership. */
export type GameEdge = {
  playerId: PlayerId
  clubId: ClubId
  season: Season
}
