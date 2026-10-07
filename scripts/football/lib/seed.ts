import { loadJson } from '../../common/json'
import { outputPath } from '../../common/paths'
import { seededIdPaths, type SeedDataset } from '../../common/seedDataset'
import type { FootballDataset } from './dataset'

export { loadSeededIds, type SeededIdMap } from '../../common/seedDataset'

export const DATASET_PATH = outputPath('football-dataset.json')

/** The football seeded-id maps — `transfermarkt id -> our UUID`, written by the club and player steps. */
export const CLUBS_SEEDED_PATH = seededIdPaths('football').clubs
export const PLAYERS_SEEDED_PATH = seededIdPaths('football').players

export function loadFootballDataset(): FootballDataset {
  const dataset = loadJson<FootballDataset | null>(DATASET_PATH, null)
  if (!dataset) {
    throw new Error(`Missing ${DATASET_PATH} — run "npm run seed:football:build" first.`)
  }
  return dataset
}

/**
 * The football dataset in the shape the shared seeding steps read. Transfermarkt ids become
 * `sourceId`s — the same keys the seeded-id maps were written with, so existing maps stay valid.
 */
export function toSeedDataset(dataset: FootballDataset): SeedDataset {
  return {
    clubs: dataset.clubs.map((c) => ({ sourceId: c.transfermarktId, name: c.name, logoUrl: c.logoUrl })),
    players: dataset.players.map((p) => ({ sourceId: p.transfermarktId, name: p.name, nationality: p.nationality })),
    memberships: dataset.memberships.map((m) => ({
      playerSourceId: m.playerTransfermarktId,
      clubSourceId: m.clubTransfermarktId,
      season: m.season,
      competition: m.competition,
      games: m.games,
    })),
  }
}
