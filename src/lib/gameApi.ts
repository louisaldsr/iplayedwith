import { Player } from '@/domain/player'
import { ClubSearchResult } from '@/domain/club'
import { PlayerId } from '@/domain/ids'
import { Season } from '@/domain/season'
import { SportId } from '@/domain/sport'
import { DailyChallenge } from '@/domain/dailyChallenge'
import { CareerStint } from '@/domain/career'

/**
 * Browser-side calls the game makes.
 *
 * Every one of these is bounded: typeahead results are capped at 20 server-side, seasons
 * are per-club, and the random pick returns a single player. Nothing here can pull the
 * dataset down — that is the point of the endpoints being shaped this way.
 */

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`${url} failed with ${res.status}`)
  return res.json()
}

export function searchPlayers(sport: SportId, q: string, signal?: AbortSignal): Promise<Player[]> {
  return getJson<Player[]>(`/api/players?sport=${sport}&q=${encodeURIComponent(q)}`, signal)
}

export function searchClubs(sport: SportId, q: string, signal?: AbortSignal): Promise<ClubSearchResult[]> {
  return getJson<ClubSearchResult[]>(`/api/clubs?sport=${sport}&q=${encodeURIComponent(q)}`, signal)
}

export function listClubSeasons(clubId: string, signal?: AbortSignal): Promise<Season[]> {
  return getJson<Season[]>(`/api/clubs/${encodeURIComponent(clubId)}/seasons`, signal)
}

/** Today's pair for the sport — the same for every visitor. */
export function getDailyChallenge(sport: SportId, signal?: AbortSignal): Promise<DailyChallenge> {
  return getJson<DailyChallenge>(`/api/${sport}/daily`, signal)
}

/**
 * Tells the server this visitor starts today's challenge — the ranking's time counts from its
 * clock, not the browser's. Fire and forget: the game never waits on it, and a failure only means
 * the time will count from the first move instead.
 */
export function startDailyChallenge(sport: SportId, day: string, visitorId: string): void {
  fetch(`/api/${sport}/daily/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ day, visitorId }),
  }).catch(() => {})
}

/** A player's clubs, season runs oldest first — shown when a player card is opened. */
export function getPlayerCareer(
  playerId: PlayerId,
  signal?: AbortSignal,
): Promise<{ player: Player; stints: CareerStint[] }> {
  return getJson(`/api/players/${encodeURIComponent(playerId)}/career`, signal)
}

export async function randomPlayer(sport: SportId, excludeId?: PlayerId): Promise<Player | null> {
  const params = new URLSearchParams({ sport })
  if (excludeId) params.set('exclude', excludeId)
  const res = await fetch(`/api/players/random?${params}`)
  if (!res.ok) return null
  return res.json()
}

/**
 * Whether two players already share a club-season.
 *
 * Easy mode refuses to start on such a pair, since the link would be auto-resolved. This
 * used to be computed in the browser over the full membership list.
 */
export async function arePlayersConnected(playerAId: PlayerId, playerBId: PlayerId): Promise<boolean> {
  const res = await fetch('/api/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerAId, playerBId }),
  })
  if (!res.ok) return false
  const result: { valid: boolean } = await res.json()
  return result.valid
}
