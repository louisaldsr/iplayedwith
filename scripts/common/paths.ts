import path from 'node:path'

/**
 * The seed pipelines' shared data directories, resolved from this file rather than from
 * each script's own `__dirname`. Scripts sit at varying depths (`scripts/rugby/`,
 * `scripts/football/lib/`), so `__dirname` arithmetic spread across them breaks the
 * moment a file moves; this is the one place that knows where the directories are.
 *
 * `input/` holds fetched source data (scrape caches, dataset downloads) and `output/`
 * holds everything the pipelines generate — both gitignored, both shared by every sport.
 */
const SCRIPTS_DIR = path.resolve(__dirname, '..')

/** `scripts/input/...` — source data, keyed by sport in its own subdirectory where it matters. */
export function inputPath(...segments: string[]): string {
  return path.resolve(SCRIPTS_DIR, 'input', ...segments)
}

/** `scripts/output/...` — generated maps, datasets and review CSVs. */
export function outputPath(...segments: string[]): string {
  return path.resolve(SCRIPTS_DIR, 'output', ...segments)
}
