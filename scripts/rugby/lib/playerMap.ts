import type { SourceId } from './sources'

/**
 * Step 1 (mapPlayers.ts) output — one entry per discovered player, keyed by a
 * per-source id (allrugby.com's numeric allrugbyId, or all.rugby's name slug).
 * `source` is optional so entries written before this field existed (all
 * allrugby.com) still load correctly — see `sourceOf`.
 */
export type PlayerMapEntry = { name: string; nationality: string | null; profileUrl: string; source?: SourceId }
export type PlayerMap = Record<string, PlayerMapEntry>

/**
 * Step 2 (seedPlayers.ts) output — tracks whether each mapped player has been created in
 * the DB. Uniqueness comes from the per-source id (allrugbyId, or an all.rugby slug
 * crosswalked to an allrugbyId when one exists), not from the name — two different real
 * people can share a name and both get created.
 */
export type SeededStatus = 'saved' | 'rejected' | 'failure'
export type SeededMapEntry = {
  status: SeededStatus
  name: string
  nationality: string | null
  profileUrl: string
  source?: SourceId
  playerId?: string
  reason?: string
}
export type SeededMap = Record<string, SeededMapEntry>

/** `entry.source`, defaulting to `'allrugby.com'` for entries written before this field existed. */
export function sourceOf(entry: { source?: SourceId }): SourceId {
  return entry.source ?? 'allrugby.com'
}
