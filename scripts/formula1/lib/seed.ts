import { loadJson } from '../../common/json'
import { outputPath } from '../../common/paths'
import type { Formula1Dataset } from './dataset'

export const DATASET_PATH = outputPath('formula1-dataset.json')

/** The built dataset — already in the shared `SeedDataset` shape, so no adapter is needed. */
export function loadFormula1Dataset(): Formula1Dataset {
  const dataset = loadJson<Formula1Dataset | null>(DATASET_PATH, null)
  if (!dataset) {
    throw new Error(`Missing ${DATASET_PATH} — run "npm run seed:formula1:build" first.`)
  }
  return dataset
}
