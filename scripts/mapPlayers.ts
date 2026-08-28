import fs from 'node:fs'
import path from 'node:path'
import { extractPlayerProfileUrls } from './lib/mutationsPageParser'
import { PROFILE_URL_RE } from './lib/playersListParser'
import { fetchWithCache } from './lib/fetchWithCache'
import { parsePlayerIdentity } from './lib/playerProfileParser'
import { alpha2ForFrenchCountryName } from './lib/nationalities'
import { titleCase } from './lib/textCase'
import { loadJson, saveJson, type PlayerMap } from './lib/playerMap'

const ALLRUGBY_ORIGIN = 'https://www.allrugby.com'
const SAVE_EVERY = 25

function toAbsoluteUrl(href: string): { url: string; allrugbyId: string } | null {
  const pathname = href.replace(/^https?:\/\/[^/]+/, '')
  const match = pathname.match(PROFILE_URL_RE)
  if (!match) return null
  const [, , allrugbyId] = match
  return { url: `${ALLRUGBY_ORIGIN}${pathname}`, allrugbyId }
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('Usage: tsx scripts/mapPlayers.ts <path-to-html-file>')
    console.error('  html file: a saved allrugby.com nationality list (e.g. france.html) or')
    console.error('  mutations/transfer page (e.g. mutations-top14.html) — every player link on it is used.')
    process.exit(1)
  }

  const html = fs.readFileSync(inputPath, 'utf8')
  const links = extractPlayerProfileUrls(html)
  console.log(`Found ${links.length} player links in ${inputPath}`)

  const mapPath = path.resolve(__dirname, 'output', 'players-map.json')
  const profilesDir = path.resolve(__dirname, 'input/players/profiles')
  const map = loadJson<PlayerMap>(mapPath, {})

  let added = 0
  let skipped = 0
  let failed = 0
  let processed = 0

  for (const href of links) {
    const parsed = toAbsoluteUrl(href)
    if (!parsed) {
      failed++
      console.error(`Skipping unrecognized player link: "${href}"`)
      continue
    }
    const { url, allrugbyId } = parsed

    if (map[allrugbyId]) {
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
      profileHtml = await fetchWithCache(url, path.join(profilesDir, `${allrugbyId}.html`))
    } catch (err) {
      failed++
      console.error(`Failed to fetch profile ${url}: ${(err as Error).message}`)
      continue
    }

    const identity = parsePlayerIdentity(profileHtml)
    if (!identity) {
      failed++
      console.error(`Failed to parse player identity from ${url}`)
      continue
    }

    const name = titleCase(identity.rawName)
    const nationality = identity.rawNationality ? alpha2ForFrenchCountryName(identity.rawNationality) : null
    if (identity.rawNationality && !nationality) {
      console.error(
        `Unrecognized nationality "${identity.rawNationality}" for "${name}" (${url}) — add it to scripts/lib/nationalities.ts.`,
      )
    }

    map[allrugbyId] = { name, nationality, profileUrl: url }
    added++
  }

  saveJson(mapPath, map)
  console.log(`Done. links=${links.length} added=${added} skipped=${skipped} failed=${failed}`)
  console.log(`Map written to ${mapPath} (${Object.keys(map).length} players total)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
