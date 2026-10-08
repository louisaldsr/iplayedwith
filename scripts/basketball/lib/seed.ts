import { loadJson } from '../../common/json'
import { outputPath } from '../../common/paths'
import type { BasketballDataset } from './dataset'

export const DATASET_PATH = outputPath('basketball-dataset.json')

/** The built dataset — already in the shared `SeedDataset` shape, so no adapter is needed. */
export function loadBasketballDataset(): BasketballDataset {
  const dataset = loadJson<BasketballDataset | null>(DATASET_PATH, null)
  if (!dataset) {
    throw new Error(`Missing ${DATASET_PATH} — run "npm run seed:basketball:build" first.`)
  }
  return dataset
}
