import type { Season } from '@/domain/season'
import type { SportId } from '@/domain/sport'
import { loadJson } from './json'
import { outputPath } from './paths'

/**
 * What every sport's import reduces its source to before seeding — the one shape the shared
 * seeding steps (`seedSteps.ts`) read.
 *
 * `sourceId` is the source's own id for the entity (a Transfermarkt id, a Basketball-Reference
 * slug, ...). It never reaches the database: the seeding steps map it to the UUID they create
 * and record that pair in the sport's seeded-id map, which is how re-runs stay idempotent and how
 * memberships resolve both of their ends.
 */
export type SeedClub = { sourceId: string; name: string; logoUrl?: string | null }

export type SeedPlayer = { sourceId: string; name: string; nationality: string | null }

export type SeedMembership = {
  playerSourceId: string
  clubSourceId: string
  season: Season
  competition: string | null
  /** The `memberships.games` contract (migration 011): games for that club that season, all competitions. NULL = the source does not say. */
  games: number | null
}

export type SeedDataset = { clubs: SeedClub[]; players: SeedPlayer[]; memberships: SeedMembership[] }

/** `sourceId -> our UUID`, written by the club and player steps and read by every later one. */
export type SeededIdMap = Record<string, string>

/** Where a sport's seeded-id maps live — `scripts/output/{sport}-{clubs,players}-seeded.json`. */
export function seededIdPaths(sport: SportId): { clubs: string; players: string } {
  return {
    clubs: outputPath(`${sport}-clubs-seeded.json`),
    players: outputPath(`${sport}-players-seeded.json`),
  }
}

export function loadSeededIds(filePath: string): SeededIdMap {
  return loadJson<SeededIdMap>(filePath, {})
}
