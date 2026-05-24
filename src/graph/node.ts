import { PlayerId, ClubId } from '../domain/ids'
import { Season } from '../domain/season'

/** A player vertex in the game graph. */
type PlayerNode = { kind: 'player'; id: PlayerId }

/**
 * A club vertex scoped to a specific season.
 * Season is part of the node identity so that two players only share a node
 * when they played at the same club in the same season.
 */
type ClubNode = { kind: 'club'; id: ClubId; season: Season }

/** A vertex in the bipartite game graph — either a player or a (club, season) pair. */
export type GameNode = PlayerNode | ClubNode
