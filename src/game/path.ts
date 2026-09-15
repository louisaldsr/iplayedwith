import { PlayerId, ClubId } from '../domain/ids'
import { Season } from '../domain/season'
import { playerKey } from './graphBuilder'

/**
 * Shortest player-only path from `fromId` to `toId`, or null if they are not connected.
 *
 * BFS over the (player ↔ club:season) graph. Club vertices are derived from the edges
 * rather than read from `nodes`, so this works for both easy mode (edges only, no club
 * nodes) and hard mode (full bipartite graph).
 *
 * The club keys used here are local to the traversal and deliberately distinct from
 * `clubKey` — they must never collide with a real node key.
 */
export function bfsPlayerPath(
  nodes: Map<string, unknown>,
  edges: { playerId: PlayerId; clubId: ClubId; season: Season }[],
  fromId: PlayerId,
  toId: PlayerId,
): PlayerId[] | null {
  const startKey = playerKey(fromId)
  const targetKey = playerKey(toId)
  if (!nodes.has(startKey) || !nodes.has(targetKey)) return null

  const bfsClubKey = (id: ClubId, season: Season) => `bfs:${id}:${season}`

  const adj = new Map<string, string[]>()
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }
  for (const e of edges) {
    addEdge(playerKey(e.playerId), bfsClubKey(e.clubId, e.season))
  }

  const prev = new Map<string, string>()
  const queue: string[] = [startKey]
  prev.set(startKey, startKey)

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === targetKey) break
    for (const neighbor of adj.get(current) ?? []) {
      if (!prev.has(neighbor)) {
        prev.set(neighbor, current)
        queue.push(neighbor)
      }
    }
  }

  if (!prev.has(targetKey)) return null

  const fullPath: string[] = []
  let cur = targetKey
  while (cur !== prev.get(cur)) {
    fullPath.unshift(cur)
    cur = prev.get(cur)!
  }
  fullPath.unshift(cur)

  return fullPath
    .filter((k) => k.startsWith('player:'))
    .map((k) => k.slice('player:'.length) as PlayerId)
}
