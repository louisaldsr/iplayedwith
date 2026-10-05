/**
 * Fame floors — the coarse grouping the game actually reads, instead of the raw 0..100 score.
 *
 * A user cannot tell a 47 from a 52, and neither can the score: it orders the top imprecisely
 * (see docs/spikes/fame.md) but groups well. So what the game shows — the card styles, points
 * later — reads a player's floor, never their score. The random draw is the one exception: it
 * reads a score band straddling two floors (drawFameBand.ts), and never shows it.
 *
 * The thresholds are ABSOLUTE, not percentiles, for the same reasons the score is: a player's
 * floor depends on their own career only, so importing other players never moves it, and the
 * top floor stays as small as stardom actually is.
 *
 * They are shared by every sport. `fame_calibration` already puts the sports on one scale —
 * measured: exactly 233 players score ≥ 70 in rugby and in football. Nothing here branches on
 * the sport.
 *
 * Nothing is stored: a floor is derived from `player_fame.score` at read time, so changing a
 * threshold needs no migration and no recompute — only a look at `fame:report`.
 */
export const FAME_FLOORS = [
  { floor: 1, key: 'famous', minScore: 70 },
  { floor: 2, key: 'known', minScore: 30 },
  // "Unsung", as in unsung hero: shown to users, so it must stay kind to the players themselves.
  { floor: 3, key: 'unsung', minScore: 0 },
] as const

export type FameFloor = (typeof FAME_FLOORS)[number]['floor']
export type FameFloorKey = (typeof FAME_FLOORS)[number]['key']

const MAX_SCORE = 100

/**
 * The floor of a score. Floor 1 is the best known; a higher floor is harder to find, and will be
 * worth more points.
 *
 * A NULL score — not computed yet — has no floor, rather than defaulting to the lowest one: an
 * unscored player is not an unknown one. A score outside 0..100 is clamped, not rejected.
 */
export function fameFloorOf(score: number | null): FameFloor | null {
  if (score === null || !Number.isFinite(score)) return null
  const clamped = Math.min(MAX_SCORE, Math.max(0, score))
  return FAME_FLOORS.find((f) => clamped >= f.minScore)!.floor
}

export function fameFloorKey(floor: FameFloor): FameFloorKey {
  return FAME_FLOORS.find((f) => f.floor === floor)!.key
}

/**
 * The inclusive range of integer scores in a floor — what a query filters on (the random draw by
 * floor), so the SQL side never has to know the floors exist.
 */
export function fameFloorRange(floor: FameFloor): { min: number; max: number } {
  const index = FAME_FLOORS.findIndex((f) => f.floor === floor)
  const above = FAME_FLOORS[index - 1]
  return { min: FAME_FLOORS[index].minScore, max: above ? above.minScore - 1 : MAX_SCORE }
}
