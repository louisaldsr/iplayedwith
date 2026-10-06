import { Club } from './club'
import { ClubId, PlayerId } from './ids'
import { Membership } from './membership'
import { Player } from './player'
import { Season } from './season'
import { GameEdge } from '../graph/edge'

/**
 * The day's stored solution, as revealed once the visitor's day is over: ONE shortest chain
 * between A and B — others of the same length may exist — in the board's own shape, so the board
 * can lay it over the visitor's own cards.
 */
export type DailySolution = {
  /** The chain, A to B. */
  path: PlayerId[]
  /** The chain's players, A to B. */
  players: Player[]
  /** The clubs of its links. */
  clubs: Club[]
  /** Two per link: each of the pair to the (club, season) they shared. */
  edges: GameEdge[]
}

export type ChainLink = { clubId: ClubId; season: Season }

/**
 * What joins each consecutive pair of a chain: a (club, season) both players belonged to — the
 * most recent one when they shared several, the club id breaking a tie, so the answer is stable.
 *
 * Null when a pair shares nothing: the memberships changed since the chain was found.
 */
export function linksOfChain(
  chain: PlayerId[],
  memberships: Pick<Membership, 'playerId' | 'clubId' | 'season'>[],
): ChainLink[] | null {
  const stintsOf = (id: PlayerId) => memberships.filter((m) => m.playerId === id)
  const links: ChainLink[] = []
  for (let i = 0; i < chain.length - 1; i++) {
    const next = new Set(stintsOf(chain[i + 1]).map((m) => `${m.clubId}|${m.season}`))
    const shared = stintsOf(chain[i])
      .filter((m) => next.has(`${m.clubId}|${m.season}`))
      .sort((a, b) => b.season.localeCompare(a.season) || a.clubId.localeCompare(b.clubId))
    if (shared.length === 0) return null
    links.push({ clubId: shared[0].clubId, season: shared[0].season })
  }
  return links
}

/** The board's edges of a chain: each player of a pair to the (club, season) linking them. */
export function edgesOfChain(chain: PlayerId[], links: ChainLink[]): GameEdge[] {
  return links.flatMap((link, i) => [
    { playerId: chain[i], clubId: link.clubId, season: link.season },
    { playerId: chain[i + 1], clubId: link.clubId, season: link.season },
  ])
}
