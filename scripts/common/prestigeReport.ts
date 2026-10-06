import { LATEST_SEASON } from '@/domain/season'
import { isSportId, SPORTS } from '@/domain/sport'
import { listClubTitles, listPrestigeCompetitions, listSeasonPrestige } from '@/services/prestigeService'
import { getDb } from './env'

/**
 * Prints what the season prestige produced, so it can be judged by name before fame reads it
 * (supabase/migrations/023_season_prestige.sql).
 *
 * The checks that matter: the top club-seasons are title and final runs; a giant's quiet
 * season (no European game) still sits well above a promoted club's; and every competition has
 * a winner for every season of the window.
 */
const TOP_N = 30
const CLUBS_N = 20
/** First season of the data, for both sports — see FIRST_SEASON_YEAR and 024's header. */
const FIRST_SEASON_START = 2012

async function main() {
  const sportArg = process.argv.find((a) => a.startsWith('--sport='))?.split('=')[1]
  if (!sportArg || !isSportId(sportArg)) {
    console.error(`Usage: prestige:report -- --sport=<${SPORTS.join('|')}>`)
    process.exit(1)
  }

  const db = getDb()
  const [seasons, competitions, titles] = await Promise.all([
    listSeasonPrestige(db, sportArg),
    listPrestigeCompetitions(db, sportArg),
    listClubTitles(db, sportArg),
  ])
  if (seasons.length === 0) {
    console.error(`No club-seasons for ${sportArg} — run the prestige import, then fame:compute.`)
    process.exit(1)
  }

  const scored = seasons.filter((s) => s.score !== null)
  const pct = (n: number) => `${((100 * n) / seasons.length).toFixed(1)}%`
  const withRun = seasons.filter((s) => Object.keys(s.details.continentalWins ?? {}).length > 0).length
  const withTitle = seasons.filter((s) => s.titles.length > 0).length

  console.log(`\n=== ${sportArg} — ${seasons.length} club-seasons ===\n`)
  console.log('Coverage')
  console.log(`  scored                      : ${scored.length} (${pct(scored.length)})`)
  // Left over from a club-season the graph no longer has: details kept, score cleared.
  console.log(`  not scored (left the graph) : ${seasons.length - scored.length}`)
  console.log(`  with a continental win      : ${withRun} (${pct(withRun)})`)
  console.log(`  with a title                : ${withTitle} (${pct(withTitle)})`)

  // A competition name the import wrote but no weight row knows: it silently counts for 0.
  const weighted = new Set(competitions.filter((c) => c.winsWeight > 0).map((c) => c.competition))
  const unknown = new Map<string, number>()
  for (const s of seasons) {
    for (const competition of Object.keys(s.details.continentalWins ?? {})) {
      if (!weighted.has(competition)) unknown.set(competition, (unknown.get(competition) ?? 0) + 1)
    }
  }
  for (const [competition, n] of unknown) {
    console.log(`  ⚠ "${competition}" in ${n} run(s) has no wins weight — counts for nothing`)
  }

  const revisions = new Set(scored.map((s) => s.revision))
  console.log(`\nRevision ${[...revisions].join(', ')}${revisions.size > 1 ? '  ⚠ mixed — run fame:compute' : ''}`)

  // Every season of the window should have a winner of every titled competition. A gap is a
  // missing seed row (rugby) or a season the derivation refused (football, see its warnings).
  console.log('\nTitles per competition')
  const latestStart = Number(LATEST_SEASON.slice(0, 4))
  for (const c of competitions.filter((c) => c.titleWeight > 0)) {
    const won = new Set(titles.filter((t) => t.competition === c.competition).map((t) => t.season))
    const missing: string[] = []
    for (let y = FIRST_SEASON_START; y <= latestStart; y++) {
      if (!won.has(`${y}-${y + 1}`)) missing.push(`${y}-${String(y + 1).slice(2)}`)
    }
    console.log(
      `  ${c.competition.padEnd(26)} ${String(won.size).padStart(2)} season(s)` +
        (missing.length > 0 ? `   missing: ${missing.join(' ')}` : ''),
    )
  }

  const run = (s: (typeof seasons)[number]) =>
    Object.entries(s.details.continentalWins ?? {})
      .map(([c, n]) => `${c} ${n}W`)
      .join(', ')
  const line = (s: (typeof seasons)[number], rank: number) =>
    `  ${String(rank).padStart(5)}. ${String(s.score).padStart(3)}  ${s.clubName.padEnd(28).slice(0, 28)} ` +
    `${s.season}  ${run(s).padEnd(34).slice(0, 34)} ${s.titles.join(', ')}`

  const sorted = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  console.log(`\nTop ${TOP_N} club-seasons — these should be the title and final runs`)
  sorted.slice(0, TOP_N).forEach((s, i) => console.log(line(s, i + 1)))

  // A club's mean over its seasons is what `brand` carries into each of them.
  const byClub = new Map<string, { name: string; scores: number[]; lowest: (typeof seasons)[number] }>()
  for (const s of scored) {
    const club = byClub.get(s.clubId) ?? { name: s.clubName, scores: [], lowest: s }
    club.scores.push(s.score ?? 0)
    if ((s.score ?? 0) < (club.lowest.score ?? 0)) club.lowest = s
    byClub.set(s.clubId, club)
  }
  const clubs = [...byClub.values()]
    .map((c) => ({ ...c, mean: c.scores.reduce((a, b) => a + b, 0) / c.scores.length }))
    .sort((a, b) => b.mean - a.mean)
  const clubLine = (c: (typeof clubs)[number], rank: number) =>
    `  ${String(rank).padStart(4)}. ${c.mean.toFixed(0).padStart(3)}  ${c.name.padEnd(28).slice(0, 28)} ` +
    `${String(c.scores.length).padStart(2)} season(s), lowest ${c.lowest.score} in ${c.lowest.season}`

  console.log(`\nTop ${CLUBS_N} clubs by mean prestige — a quiet season should stay well above the bottom`)
  clubs.slice(0, CLUBS_N).forEach((c, i) => console.log(clubLine(c, i + 1)))
  console.log(`\nBottom ${CLUBS_N} clubs`)
  clubs.slice(-CLUBS_N).forEach((c, i) => console.log(clubLine(c, clubs.length - CLUBS_N + i + 1)))

  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
