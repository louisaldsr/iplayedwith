import { loadJson } from '../../common/json'
import { outputPath } from '../../common/paths'
import type { FootballDataset } from './dataset'

/**
 * Maps a Transfermarkt id to the UUID we created for it, so the three seeding steps can
 * resume after a failure and so memberships can resolve both ends of each row. Same role
 * `players-seeded.json` plays in the rugby pipeline.
 */
export type SeededIdMap = Record<string, string>

export const DATASET_PATH = outputPath('football-dataset.json')
export const CLUBS_SEEDED_PATH = outputPath('football-clubs-seeded.json')
export const PLAYERS_SEEDED_PATH = outputPath('football-players-seeded.json')

export function loadFootballDataset(): FootballDataset {
  const dataset = loadJson<FootballDataset | null>(DATASET_PATH, null)
  if (!dataset) {
    throw new Error(`Missing ${DATASET_PATH} — run "npm run seed:football:build" first.`)
  }
  return dataset
}

export function loadSeededIds(filePath: string): SeededIdMap {
  return loadJson<SeededIdMap>(filePath, {})
}
