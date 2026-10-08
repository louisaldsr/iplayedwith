import fs from 'node:fs'
import path from 'node:path'
import { isSportId, SPORTS, type SportId } from '@/domain/sport'
import { computeFameScores, importExposure, listFame, type ExposureRowInput } from '@/services/fameService'
import { getDb } from './env'
import { loadJson } from './json'
import { inputPath, outputPath } from './paths'
import { matchPlayers, viewWindow, viewsPerYear, type MatchCandidate } from './lib/wikidata'
import { articleTitles, itemsByEnwikiTitle, itemsByExternalId, itemsWithoutIdByName, pageviews } from './lib/wikimedia'
import { sourceOf, type SeededMap } from '../rugby/lib/playerMap'
import { SOURCES } from '../rugby/lib/sources'
import { PLAYERS_SEEDED_PATH, loadSeededIds } from '../football/lib/seed'
import { seededIdPaths } from './seedDataset'
import { loadFormula1Dataset } from '../formula1/lib/seed'

/**
 * The exposure pillar of the fame score (supabase/migrations/025_fame_v3.sql): matches each
 * player to his Wikidata item, then averages the French and English Wikipedia views of the item's
 * articles over the last 36 full months, and writes both into `player_fame.details`. Then
 * rescores the sport.
 *
 *   npm run fame:exposure -- --sport=rugby [--dry-run]
 *
 * Matching is by an ID the source shares with Wikidata — exact, never a guess between homonyms —
 * or, for Formula 1, by the English Wikipedia article the source links for each driver; with a
 * unique-name fallback for experienced rugby players whose item lacks the ID (see
 * lib/wikidata.ts). Coverage measured on the prototype: rugby 93-95% of players past 100 games,
 * football 98%.
 *
 * Long: ~6,400 rugby and ~20,000 football article histories at ~150 a minute. The views are
 * cached in scripts/input/wikipedia/, so a stopped run resumes where it was, and a re-run in the
 * same month costs nothing. Rugby reads the profile cache: run it from the checkout that has it.
 *
 * Reads the players from the database (names and career games); --dry-run writes nothing.
 */
type SportConfig = {
  /** Wikidata items by external ID, for the IDs our players carry. */
  itemsById(externalIds: string[]): Promise<Map<string, string[]>>
  /** The name fallback's candidates — items of the sport without the ID, by label; null: no fallback. */
  itemsWithoutIdByName: (() => Promise<Map<string, string[]>>) | null
  /** Career games from which a player may be matched by name. */
  minGamesForName: number | null
  /** Our player id → his external ID, from the source the imports already use. */
  externalIds(): Map<string, string>
}

/** Items carrying a Wikidata external-ID property — the whole property at once, by SPARQL. */
const byProperty = (property: string) => () => itemsByExternalId(property)

const CONFIG: Record<SportId, SportConfig> = {
  rugby: {
    itemsById: byProperty('P9903'), // All.Rugby player ID
    itemsWithoutIdByName: () => itemsWithoutIdByName('Q14089670', 'P9903'), // rugby union player
    minGamesForName: 100,
    externalIds: rugbyExternalIds,
  },
  football: {
    itemsById: byProperty('P2446'), // Transfermarkt player ID
    // 99% of the players match by ID: a name fallback would add more risk than coverage.
    itemsWithoutIdByName: null,
    minGamesForName: null,
    externalIds: footballExternalIds,
  },
  basketball: {
    itemsById: byProperty('P2685'), // Basketball Reference NBA player ID
    // Every NBA player has a Basketball-Reference page, and Wikidata links most of them.
    itemsWithoutIdByName: null,
    minGamesForName: null,
    externalIds: basketballExternalIds,
  },
  formula1: {
    // No Wikidata property for Jolpica's driver IDs — but Jolpica links each driver's article.
    itemsById: itemsByEnwikiTitle,
    itemsWithoutIdByName: null,
    minGamesForName: null,
    externalIds: formula1ExternalIds,
  },
}

/** The English Wikipedia title Jolpica links for each Formula 1 driver (lib/dataset.ts). */
function formula1ExternalIds(): Map<string, string> {
  const seeded = loadSeededIds(seededIdPaths('formula1').players)
  const ids = new Map<string, string>()
  for (const driver of loadFormula1Dataset().players) {
    const playerId = seeded[driver.sourceId]
    if (playerId && driver.enwikiTitle) ids.set(playerId, driver.enwikiTitle)
  }
  return ids
}

/**
 * The Basketball-Reference ID each basketball player was seeded from, in Wikidata's form: the
 * site files players under the first letter of the slug, and P2685 keeps it — "j/jordami01".
 */
function basketballExternalIds(): Map<string, string> {
  const seeded = loadSeededIds(seededIdPaths('basketball').players)
  return new Map(Object.entries(seeded).map(([slug, playerId]) => [playerId, `${slug[0]}/${slug}`]))
}

/** The All.Rugby ID on each cached profile — the key Wikidata stores, homonyms told apart. */
function rugbyExternalIds(): Map<string, string> {
  const seeded = loadJson<SeededMap>(outputPath('players-seeded.json'), {})
  const profilesDir = inputPath('players', 'profiles')
  const ids = new Map<string, string>()
  for (const [id, entry] of Object.entries(seeded)) {
    if (entry.status !== 'saved' || !entry.playerId) continue
    const source = sourceOf(entry)
    const file = path.join(profilesDir, `${source}-${id}.html`)
    if (!fs.existsSync(file)) continue
    const allRugbyId = SOURCES[source].parseAllRugbyId(fs.readFileSync(file, 'utf8'))
    if (allRugbyId) ids.set(entry.playerId, allRugbyId)
  }
  return ids
}

/** The Transfermarkt ID each football player was seeded from. */
function footballExternalIds(): Map<string, string> {
  const seeded = loadSeededIds(PLAYERS_SEEDED_PATH)
  return new Map(Object.entries(seeded).map(([transfermarktId, playerId]) => [playerId, transfermarktId]))
}

async function main() {
  const sport = process.argv.find((a) => a.startsWith('--sport='))?.split('=')[1]
  if (!sport || !isSportId(sport)) {
    console.error(`Usage: fame:exposure -- --sport=<${SPORTS.join('|')}> [--dry-run]`)
    process.exit(1)
  }
  const dryRun = process.argv.includes('--dry-run')
  const config = CONFIG[sport]
  const db = getDb()

  const players = await listFame(db, sport)
  const externalIds = config.externalIds()
  console.log(`${players.length} ${sport} players; external ID known for ${externalIds.size}.`)

  const itemsById = await config.itemsById([...new Set(externalIds.values())])
  const itemsByName = config.itemsWithoutIdByName ? await config.itemsWithoutIdByName() : new Map()
  console.log(`Wikidata: ${itemsById.size} IDs, ${itemsByName.size} names without an ID.`)

  const candidates: MatchCandidate[] = players.map((p) => ({
    playerId: p.id,
    externalId: externalIds.get(p.id) ?? null,
    name: p.name,
    games: p.games ?? 0,
  }))
  const matches = matchPlayers(candidates, itemsById, itemsByName, config.minGamesForName)
  const byName = [...matches.values()].filter((m) => m.how === 'unique-name').length
  console.log(`Matched ${matches.size}/${players.length} (${matches.size - byName} by ID, ${byName} by unique name).`)

  const titles = await articleTitles([...new Set([...matches.values()].map((m) => m.qid))])
  const window = viewWindow(new Date())
  const jobs = [...titles.values()].flatMap((byLang) => [...byLang].map(([lang, title]) => ({ lang, title })))
  const views = await pageviews(jobs, window, inputPath('wikipedia'))

  const rows: ExposureRowInput[] = players.map((p) => {
    const match = matches.get(p.id)
    if (!match) return { playerId: p.id, wikidataId: null, match: null, viewsPerYear: null, viewsWindow: window.label }
    const byLang = new Map<string, number>()
    for (const [lang, title] of titles.get(match.qid) ?? []) {
      const v = views.get(`${lang}|${title}`)
      if (v !== undefined) byLang.set(lang, v)
    }
    return {
      playerId: p.id,
      wikidataId: match.qid,
      match: match.how,
      viewsPerYear: viewsPerYear(byLang, window.years),
      viewsWindow: window.label,
    }
  })
  const measured = rows.filter((r) => r.viewsPerYear !== null).length
  console.log(`Exposure measured for ${measured}/${players.length} (window ${window.label}).`)

  if (dryRun) {
    console.log('Done (dry run, no DB writes).')
    return
  }
  const { written } = await importExposure(db, sport, rows)
  const { scored } = await computeFameScores(db, sport)
  console.log(`Done. details written=${written}, scored=${scored}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
