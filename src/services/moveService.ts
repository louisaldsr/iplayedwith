import { SupabaseClient } from '@supabase/supabase-js'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import * as playersRepo from '@/repositories/playersRepository'
import * as clubsRepo from '@/repositories/clubsRepository'
import { ClubId, PlayerId } from '@/domain/ids'
import { Season } from '@/domain/season'
import { SportId } from '@/domain/sport'
import { Player } from '@/domain/player'
import { Club } from '@/domain/club'
import { Membership } from '@/domain/membership'
import { DifficultyLevel } from '@/game/game'
import { UserInput } from '@/game/userInput'
import { MembershipIndex } from '@/game/membershipIndex'
import { GraphBuilder, playerKey, clubKey } from '@/game/graphBuilder'
import { applyMove as applyMoveRules } from '@/game/moveRules'
import { GameNode } from '@/graph/node'
import { GameEdge } from '@/graph/edge'
import { bfsPlayerPath } from '@/game/path'
import { NotFoundError, ValidationError } from '@/services/errors'

/**
 * The client's view of its own graph, sent with every move.
 *
 * The session is deliberately stateless: there is no server-side game record to create,
 * expire or clean up. The trade-off is that this arrives from the browser and cannot be
 * trusted — `applyMove` re-checks every edge against the database before using it.
 */
export type GraphState = {
  players: string[]
  clubs: { id: string; season: string }[]
  edges: { playerId: string; clubId: string; season: string }[]
}

export type MoveRequest = {
  playerAId: string
  playerBId: string
  difficulty: DifficultyLevel
  graph: GraphState
  move: UserInput
}

/** The node a successful move added, resolved so the board can render it without a lookup table. */
export type ResolvedNode =
  | { kind: 'player'; player: Player }
  | { kind: 'club'; club: Club; season: Season }

export type MoveResult =
  | { ok: true; node: ResolvedNode; edges: GameEdge[]; clubs: Club[]; victory: boolean; path: PlayerId[] }
  | { ok: false; reason: string }

/** Player ids whose memberships the engine can touch while processing `move`. */
function relevantPlayerIds(graph: GraphState, move: UserInput): PlayerId[] {
  const ids = graph.players.map(PlayerId)
  if (move.kind === 'easy' || move.kind === 'hard-player') ids.push(move.playerId)
  return [...new Set(ids)]
}

/**
 * Rebuilds the engine's node map from the submitted graph.
 *
 * Uses the same key helpers as `createEngine`, so a rehydrated graph is indistinguishable
 * from one the engine built itself.
 */
function rehydrateNodes(graph: GraphState): Map<string, GameNode> {
  const nodes = new Map<string, GameNode>()
  for (const raw of graph.players) {
    const id = PlayerId(raw)
    nodes.set(playerKey(id), { kind: 'player', id })
  }
  for (const raw of graph.clubs) {
    const id = ClubId(raw.id)
    const season = raw.season as Season
    nodes.set(clubKey(id, season), { kind: 'club', id, season })
  }
  return nodes
}

/**
 * Applies one move against the database.
 *
 * The engine (`GraphBuilder`, `MembershipIndex`, the validation rules) is used exactly as
 * the client used to use it — the only change is what it is indexed over. A move can only
 * ever read memberships belonging to players already in the graph plus the one being
 * submitted, so that slice is fetched in a single indexed query and everything else
 * proceeds in memory over a few hundred rows.
 */
export async function applyMove(
  db: SupabaseClient,
  sport: SportId,
  req: MoveRequest,
): Promise<MoveResult> {
  const playerAId = PlayerId(req.playerAId)
  const playerBId = PlayerId(req.playerBId)

  if (!req.graph.players.includes(playerAId) || !req.graph.players.includes(playerBId)) {
    throw new ValidationError('graph must contain both playerA and playerB')
  }

  const slice = await membershipsRepo.listForPlayers(db, sport, relevantPlayerIds(req.graph, req.move))
  const index = new MembershipIndex(slice as Membership[])

  // The submitted graph is untrusted input. Every edge it claims must correspond to a real
  // membership, otherwise a forged edge could fabricate a connection and win the game.
  for (const e of req.graph.edges) {
    if (!index.hasExact(PlayerId(e.playerId), ClubId(e.clubId), e.season as Season)) {
      throw new ValidationError(`edge ${e.playerId}/${e.clubId}/${e.season} does not match any membership`)
    }
  }

  const nodes = rehydrateNodes(req.graph)
  const edges: GameEdge[] = req.graph.edges.map((e) => ({
    playerId: PlayerId(e.playerId),
    clubId: ClubId(e.clubId),
    season: e.season as Season,
  }))
  const edgeCountBefore = edges.length

  // Already-won games take no further moves, matching the in-memory engine.
  if (bfsPlayerPath(nodes, edges, playerAId, playerBId) !== null) {
    return { ok: false, reason: 'La partie est déjà terminée.' }
  }

  const builder = new GraphBuilder(index, nodes, edges, req.difficulty)
  const rejection = applyMoveRules(builder, index, req.move, req.difficulty)
  if (rejection) return { ok: false, reason: rejection }

  const path = bfsPlayerPath(nodes, edges, playerAId, playerBId)
  const newEdges = edges.slice(edgeCountBefore)

  return {
    ok: true,
    node: await resolveNode(db, sport, req.move),
    edges: newEdges,
    clubs: await resolveEdgeClubs(db, newEdges),
    victory: path !== null,
    path: path ?? [],
  }
}

/**
 * Loads the clubs the new edges point at.
 *
 * In easy mode the added node is a player and no club node is ever created, yet each edge
 * carries a (club, season) the board shows when the edge is opened. Without this the client
 * holds a club id it has no name for and prints the id.
 */
async function resolveEdgeClubs(db: SupabaseClient, edges: GameEdge[]): Promise<Club[]> {
  const ids = [...new Set(edges.map((e) => e.clubId))]
  return clubsRepo.findManyByIds(db, ids)
}

/** Loads the name/nationality/logo the board needs for the node just added. */
async function resolveNode(db: SupabaseClient, sport: SportId, move: UserInput): Promise<ResolvedNode> {
  if (move.kind === 'easy' || move.kind === 'hard-player') {
    const player = await playersRepo.findById(db, move.playerId)
    if (!player) throw new NotFoundError(`player "${move.playerId}" not found`)
    if (player.sport !== sport) throw new ValidationError(`player "${move.playerId}" does not play ${sport}`)
    return { kind: 'player', player }
  }

  const club = await clubsRepo.findById(db, move.clubId)
  if (!club) throw new NotFoundError(`club "${move.clubId}" not found`)
  if (club.sport !== sport) throw new ValidationError(`club "${move.clubId}" does not play ${sport}`)
  return { kind: 'club', club, season: move.season }
}
