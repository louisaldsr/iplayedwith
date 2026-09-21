import fs from 'node:fs'
import path from 'node:path'
import { SOURCES, isSourceId, type SourceId } from './lib/sources'
import { fetchWithCache } from '../common/fetchWithCache'
import { titleCase } from '../common/textCase'
import { loadJson, saveJson } from '../common/json'
import { inputPath, outputPath } from '../common/paths'
import type { PlayerMap } from './lib/playerMap'

const SAVE_EVERY = 25

type Stats = { added: number; skipped: number; failed: number }

function parseArgs(argv: string[]): { inputPath: string; source: SourceId } {
  let source: SourceId = 'allrugby.com'
  const rest: string[] = []
  for (const arg of argv) {
    if (arg.startsWith('--source=')) {
      const value = arg.slice('--source='.length)
      if (!isSourceId(value)) throw new Error(`Unknown source "${value}"`)
      source = value
    } else {
      rest.push(arg)
    }
  }
  const inputPath = rest[0]
  if (!inputPath) throw new Error('missing input path')
  return { inputPath, source }
}

async function processHtmlFile(
  filePath: string,
  source: SourceId,
  map: PlayerMap,
  mapPath: string,
  profilesDir: string,
): Promise<Stats> {
  const adapter = SOURCES[source]
  const html = fs.readFileSync(filePath, 'utf8')
  const links = adapter.extractPlayerProfileUrls(html)
  console.log(`Found ${links.length} player links in ${filePath} (source=${source})`)

  let added = 0
  let skipped = 0
  let failed = 0
  let processed = 0

  for (const href of links) {
    const parsed = adapter.resolveProfileLink(href)
    if (!parsed) {
      failed++
      console.error(`Skipping unrecognized player link: "${href}"`)
      continue
    }
    const { url, id } = parsed

    if (map[id]) {
      skipped++
      continue
    }

    processed++
    if (processed % SAVE_EVERY === 0) {
      console.log(`... ${processed}/${links.length - skipped} new players processed`)
      saveJson(mapPath, map)
    }

    let profileHtml: string
    try {
      profileHtml = await fetchWithCache(url, path.join(profilesDir, `${source}-${id}.html`))
    } catch (err) {
      failed++
      console.error(`Failed to fetch profile ${url}: ${(err as Error).message}`)
      continue
    }

    // If this player also has an allrugby.com page, fold them into its single numeric-id
    // space under that id/url/source instead of this source's own id — an exact identity,
    // no fuzzy matching needed, and downstream steps process them exactly like any other
    // allrugby.com-discovered player.
    const crosswalk = adapter.crosswalkToAllrugbyCom?.(profileHtml)
    const finalSource: SourceId = crosswalk ? 'allrugby.com' : source
    const finalId = crosswalk ? crosswalk.id : id
    const finalUrl = crosswalk ? crosswalk.url : url

    if (crosswalk && map[finalId]) {
      skipped++
      continue
    }

    const identity = adapter.parseIdentity(profileHtml)
    if (!identity) {
      failed++
      console.error(`Failed to parse player identity from ${url}`)
      continue
    }

    const name = titleCase(identity.rawName)
    const nationality = identity.rawNationality ? adapter.nationalityToAlpha2(identity.rawNationality) : null
    if (identity.rawNationality && !nationality) {
      console.error(
        `Unrecognized nationality "${identity.rawNationality}" for "${name}" (${url}) — add it to scripts/lib/nationalities.ts.`,
      )
    }

    map[finalId] = { name, nationality, profileUrl: finalUrl, source: finalSource }
    added++
  }

  return { added, skipped, failed }
}

async function main() {
  let inputArg: string
  let source: SourceId
  try {
    ;({ inputPath: inputArg, source } = parseArgs(process.argv.slice(2)))
  } catch {
    console.error('Usage: tsx scripts/mapPlayers.ts [--source=allrugby.com|all.rugby] <path-to-html-file-or-folder>')
    console.error('  path: a saved player-list/transfers/mutations html file, or a folder of them —')
    console.error('  every player link on each is used. Defaults to --source=allrugby.com.')
    process.exit(1)
    return
  }

  const htmlFiles = fs.statSync(inputArg).isDirectory()
    ? fs
        .readdirSync(inputArg)
        .filter((f) => f.toLowerCase().endsWith('.html'))
        .sort()
        .map((f) => path.join(inputArg, f))
    : [inputArg]

  if (htmlFiles.length === 0) {
    console.error(`No .html files found in ${inputArg}`)
    process.exit(1)
  }

  const mapPath = outputPath('players-map.json')
  const profilesDir = inputPath('players', 'profiles')
  const map = loadJson<PlayerMap>(mapPath, {})

  let added = 0
  let skipped = 0
  let failed = 0

  for (const filePath of htmlFiles) {
    const stats = await processHtmlFile(filePath, source, map, mapPath, profilesDir)
    added += stats.added
    skipped += stats.skipped
    failed += stats.failed
    saveJson(mapPath, map)
  }

  console.log(`Done. files=${htmlFiles.length} added=${added} skipped=${skipped} failed=${failed}`)
  console.log(`Map written to ${mapPath} (${Object.keys(map).length} players total)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
