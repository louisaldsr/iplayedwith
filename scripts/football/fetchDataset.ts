import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import { execFileSync } from 'node:child_process'
import { DATASET_FILES, footballInputDir } from './lib/transfermarktDataset'

/**
 * Public, auth-free mirror of the dcaribou/transfermarkt-datasets build (CC0). The
 * project's own README links it as the "Download Dataset" button; Kaggle hosts the same
 * build behind an account, so we use this one.
 */
const DATASET_URL = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/transfermarkt-datasets.zip'

/**
 * Downloads the Transfermarkt dataset archive (~241 MB) and extracts only the five
 * tables the football import reads, into `scripts/input/football/`. The other seven
 * tables (game_lineups alone is 125 MB) are never unpacked.
 *
 * Cache-first, like `fetchWithCache`: with every file already present this is a no-op,
 * so the later pipeline steps can be re-run freely without re-downloading.
 */
async function main() {
  const force = process.argv.includes('--force')
  const outDir = footballInputDir()

  const missing = DATASET_FILES.filter((f) => !fs.existsSync(path.join(outDir, f)))
  if (missing.length === 0 && !force) {
    console.log(`All ${DATASET_FILES.length} dataset files already present in ${outDir} — nothing to do (use --force to re-download).`)
    return
  }
  console.log(`Missing ${missing.length}/${DATASET_FILES.length} dataset files — downloading.`)

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transfermarkt-'))
  const zipPath = path.join(tmpDir, 'transfermarkt-datasets.zip')

  try {
    console.log(`Downloading ${DATASET_URL} ...`)
    const res = await fetch(DATASET_URL)
    if (!res.ok) throw new Error(`Download failed (${res.status}) for ${DATASET_URL}`)
    if (!res.body) throw new Error('Download returned an empty body')
    // Streamed to disk rather than buffered — the archive is ~241 MB.
    await pipeline(Readable.fromWeb(res.body as ReadableStream<Uint8Array>), fs.createWriteStream(zipPath))
    console.log(`Downloaded ${(fs.statSync(zipPath).size / 1e6).toFixed(1)} MB`)

    fs.mkdirSync(outDir, { recursive: true })
    // `unzip` ships with macOS and every Linux CI image, and extracting named members
    // from a 241 MB archive is exactly what it is good at — no unzip dependency needed.
    execFileSync('unzip', ['-o', '-q', zipPath, ...DATASET_FILES, '-d', outDir], { stdio: 'inherit' })

    for (const file of DATASET_FILES) {
      const target = path.join(outDir, file)
      if (!fs.existsSync(target)) throw new Error(`Expected ${file} in the archive, but it was not extracted`)
      console.log(`  ${file} — ${(fs.statSync(target).size / 1e6).toFixed(1)} MB`)
    }
    console.log(`Done. Dataset files written to ${outDir}`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
