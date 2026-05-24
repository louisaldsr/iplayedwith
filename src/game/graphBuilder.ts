import { PlayerId, ClubId } from '../domain/ids'
import { Season } from '../domain/season'
import { GameNode } from '../graph/node'
import { GameEdge } from '../graph/edge'
import { MembershipIndex } from './membershipIndex'

/** Returns the map key for a player node. */
export const playerKey = (id: PlayerId): string => `player:${id}`

/** Returns the map key for a (club, season) node. Season is part of the key so players only share a node when they played together. */
export const clubKey = (id: ClubId, season: Season): string => `club:${id}:${season}`

/**
 * Manages incremental expansion of the bipartite game graph.
 *
 * Holds shared references to `nodes` and `edges` from the `Game` object, so
 * all mutations are immediately visible on `game.nodes` / `game.edges`.
 *
 * Core invariant: after any `addPlayer` call, every possible edge between the
 * current node set is present in `edges`. This guarantees that refusing a
 * duplicate player is safe — their connections are already fully wired.
 *
 * Node key convention (to avoid collisions between player and club IDs):
 *   - Players : `player:<id>`
 *   - Clubs   : `club:<id>:<season>`
 */
export class GraphBuilder {
  private index: MembershipIndex
  private nodes: Map<string, GameNode>
  private edges: GameEdge[]

  constructor(index: MembershipIndex, nodes: Map<string, GameNode>, edges: GameEdge[]) {
    this.index = index
    this.nodes = nodes
    this.edges = edges
  }

  /** Returns true if a player node for this id is already in the graph. */
  hasPlayer(playerId: PlayerId): boolean {
    return this.nodes.get(playerKey(playerId))?.kind === 'player'
  }

  /** Returns true if a (club, season) node is already in the graph. */
  hasClub(clubId: ClubId, season: Season): boolean {
    return this.nodes.has(clubKey(clubId, season))
  }

  /** Returns the set of all player IDs currently in the graph. */
  getPlayerIds(): Set<PlayerId> {
    const result = new Set<PlayerId>()
    for (const node of this.nodes.values()) {
      if (node.kind === 'player') result.add(node.id)
    }
    return result
  }

  /**
   * Adds a player node and fully wires all its memberships to the existing graph.
   *
   * For each membership of the new player:
   * - If the (club, season) node already exists → add the edge directly.
   * - If the (club, season) node is new → delegate to `addClub`, which wires
   *   the new player (already in `nodes`) alongside all other existing players,
   *   so no duplicate edge push is needed here.
   *
   * Idempotent: silently returns if the player is already present.
   */
  addPlayer(playerId: PlayerId): void {
    if (this.nodes.has(playerKey(playerId))) return

    this.nodes.set(playerKey(playerId), { kind: 'player', id: playerId })

    for (const m of this.index.getByPlayer(playerId)) {
      if (this.nodes.has(clubKey(m.clubId, m.season))) {
        this.edges.push({ playerId, clubId: m.clubId, season: m.season })
      } else {
        this.addClub(m.clubId, m.season)
      }
    }
  }

  /**
   * Adds a (club, season) node and wires it to every player already in the graph
   * who has a matching membership for that exact season.
   *
   * Idempotent: silently returns if the node is already present.
   */
  private addClub(clubId: ClubId, season: Season): void {
    const key = clubKey(clubId, season)
    if (this.nodes.has(key)) return

    this.nodes.set(key, { kind: 'club', id: clubId, season })

    for (const m of this.index.getByClub(clubId)) {
      if (m.season === season && this.nodes.has(playerKey(m.playerId))) {
        this.edges.push({ playerId: m.playerId, clubId, season })
      }
    }
  }
}
