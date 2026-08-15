import { PlayerId, ClubId } from '../domain/ids'
import { Season } from '../domain/season'
import { GameNode } from '../graph/node'
import { GameEdge } from '../graph/edge'
import { MembershipIndex } from './membershipIndex'
import { DifficultyLevel } from './game'

/** Returns the map key for a player node. */
export const playerKey = (id: PlayerId): string => `player:${id}`

/** Returns the map key for a club:season node. */
export const clubKey = (id: ClubId, season: Season): string => `club:${id}:${season}`

/**
 * Manages incremental expansion of the game graph.
 *
 * Easy mode: only player nodes + edges (no club nodes).
 * Hard mode: bipartite — player nodes + club:season nodes + edges between them.
 */
export class GraphBuilder {
  private index: MembershipIndex
  private nodes: Map<string, GameNode>
  private edges: GameEdge[]
  private difficulty: DifficultyLevel

  constructor(
    index: MembershipIndex,
    nodes: Map<string, GameNode>,
    edges: GameEdge[],
    difficulty: DifficultyLevel,
  ) {
    this.index = index
    this.nodes = nodes
    this.edges = edges
    this.difficulty = difficulty
  }

  /** Returns true if a player node for this id is already in the graph. */
  hasPlayer(playerId: PlayerId): boolean {
    return this.nodes.get(playerKey(playerId))?.kind === 'player'
  }

  /** Returns true if a club:season node is already in the graph. */
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
   * Adds only the player node — no clubs, no edges.
   * Used during engine initialization to seed playerA and playerB.
   */
  addPlayerNode(playerId: PlayerId): void {
    if (this.nodes.has(playerKey(playerId))) return
    this.nodes.set(playerKey(playerId), { kind: 'player', id: playerId })
  }

  /**
   * Adds a player node and wires edges based on difficulty.
   *
   * Easy: edges to all existing players sharing a (club, season) — no club nodes created.
   * Hard: edges only to existing club:season nodes — no new club nodes created here.
   */
  addPlayer(playerId: PlayerId): void {
    if (this.nodes.has(playerKey(playerId))) return
    this.nodes.set(playerKey(playerId), { kind: 'player', id: playerId })

    if (this.difficulty === 'easy') {
      for (const m of this.index.getByPlayer(playerId)) {
        const sharedPlayers = this.index.getByClub(m.clubId).filter(
          mb => mb.season === m.season && mb.playerId !== playerId && this.nodes.has(playerKey(mb.playerId)),
        )
        if (sharedPlayers.length > 0) {
          this.ensureEdge(playerId, m.clubId, m.season)
          for (const mb of sharedPlayers) {
            this.ensureEdge(mb.playerId, m.clubId, m.season)
          }
        }
      }
    } else {
      for (const m of this.index.getByPlayer(playerId)) {
        if (this.nodes.has(clubKey(m.clubId, m.season))) {
          this.ensureEdge(playerId, m.clubId, m.season)
        }
      }
    }
  }

  /**
   * Adds a club:season node and wires edges to all existing players who played there.
   * Hard mode only.
   */
  addClubSeasonNode(clubId: ClubId, season: Season): void {
    const ck = clubKey(clubId, season)
    if (this.nodes.has(ck)) return
    this.nodes.set(ck, { kind: 'club', id: clubId, season })
    for (const pid of this.getPlayerIds()) {
      if (this.index.hasExact(pid, clubId, season)) {
        this.ensureEdge(pid, clubId, season)
      }
    }
  }

  private ensureEdge(playerId: PlayerId, clubId: ClubId, season: Season): void {
    if (!this.edges.some(e => e.playerId === playerId && e.clubId === clubId && e.season === season)) {
      this.edges.push({ playerId, clubId, season })
    }
  }
}
