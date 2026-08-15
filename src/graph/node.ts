import { PlayerId, ClubId } from '../domain/ids'
import { Season } from '../domain/season'

/** A player vertex in the game graph. */
type PlayerNode = { kind: 'player'; id: PlayerId }

/** A club vertex scoped to a specific season (used in hard mode). */
type ClubNode = { kind: 'club'; id: ClubId; season: Season }

/** A vertex in the game graph — either a player or a club:season. */
export type GameNode = PlayerNode | ClubNode
