import fs from 'node:fs'
import path from 'node:path'
import { getDb } from './lib/env'
import { nationalityForStem } from './lib/nationalities'
import { parsePlayersListHtml } from './lib/playersListParser'
import { createPlayer } from '@/services/playersService'
import { ServiceError } from '@/services/errors'

type PlayerMapEntry = { playerId: string; name: string; profileUrl: string }
type PlayerMap = Record<string, PlayerMapEntry>

const SAVE_EVERY = 25

function loadMap(mapPath: string): PlayerMap {
  if (!fs.existsSync(mapPath)) return {}
  return JSON.parse(fs.readFileSync(mapPath, 'utf8')) as PlayerMap
}

function saveMap(mapPath: string, map: PlayerMap) {
  fs.mkdirSync(path.dirname(mapPath), { recursive: true })
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), 'utf8')
}

async function main() {
  const stem = process.argv[2]
  if (!stem) {
    console.error('Usage: tsx scripts/seedPlayers.ts <nationality-stem>  (e.g. france)')
    process.exit(1)
  }

  const nationality = nationalityForStem(stem)
  const inputPath = path.resolve(__dirname, 'input/players', `${stem}.html`)
  const mapPath = path.resolve(__dirname, 'output', `players-map.${stem}.json`)

  const html = fs.readFileSync(inputPath, 'utf8')
  const listed = parsePlayersListHtml(html)
  console.log(`Parsed ${listed.length} players from ${inputPath}`)

  const map = loadMap(mapPath)
  const db = getDb()

  let created = 0
  let skipped = 0
  let failed = 0

  for (const player of listed) {
    if (map[player.allrugbyId]) {
      skipped++
      continue
    }

    try {
      const created_ = await createPlayer(db, { name: player.name, sport: 'rugby', nationality })
      map[player.allrugbyId] = { playerId: created_.id, name: created_.name, profileUrl: player.profileUrl }
      created++
    } catch (err) {
      failed++
      const message = err instanceof ServiceError ? err.message : String(err)
      console.error(`Failed to create player "${player.name}" (${player.allrugbyId}): ${message}`)
    }

    if (created % SAVE_EVERY === 0) saveMap(mapPath, map)
  }

  saveMap(mapPath, map)
  console.log(`Done. created=${created} skipped=${skipped} failed=${failed} total=${listed.length}`)
  console.log(`Map written to ${mapPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
