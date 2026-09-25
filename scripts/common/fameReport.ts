import { isSportId, SPORTS } from '@/domain/sport'
import { listFame } from '@/services/fameService'
import { getDb } from './env'

/**
 * Prints what the fame metric actually produced, so it can be judged before the game depends
 * on it.
 *
 * The numbers alone do not settle whether the formula is right — a well-shaped distribution
 * over a wrong ranking looks identical to a correct one. The named top and bottom are the real
 * check: if the top is not full of players you recognise, the formula is wrong regardless of
 * how the histogram looks.
 */
const TOP_N = 30

function bar(count: number, max: number, width = 32): string {
  return '█'.repeat(Math.max(1, Math.round((count / Math.max(max, 1)) * width)))
}

async function main() {
  const sportArg = process.argv.find((a) => a.startsWith('--sport='))?.split('=')[1]
  if (!sportArg || !isSportId(sportArg)) {
    console.error(`Usage: fame:report -- --sport=<${SPORTS.join('|')}>`)
    process.exit(1)
  }

  const players = await listFame(getDb(), sportArg)
  if (players.length === 0) {
    console.error(`No players for ${sportArg}.`)
    process.exit(1)
  }

  const scored = players.filter((p) => p.score !== null)
  const unscored = players.length - scored.length

  console.log(`\n=== ${sportArg} — ${players.length} players ===\n`)

  // Coverage first: a clean-looking distribution over signals nobody wrote is the trap to catch.
  // Games and seasons come from memberships, exactly as the score will read them.
  const withGames = players.filter((p) => (p.games ?? 0) > 0).length
  const gamesUnknown = players.filter((p) => p.seasons > 0 && p.games === null).length
  const withCaps = players.filter((p) => (p.details.caps ?? 0) > 0).length
  const noMemberships = players.filter((p) => p.seasons === 0).length
  const pct = (n: number) => `${((100 * n) / players.length).toFixed(1)}%`

  // The most recent import stamps every row it touched with the same `updatedAt`; anything
  // older was not refreshed by it, which usually means the source dropped the player.
  const stamps = players.map((p) => p.details.updatedAt).filter((s): s is string => !!s)
  const latest = stamps.length > 0 ? stamps.reduce((a, b) => (a > b ? a : b)) : null
  const stale = latest ? players.filter((p) => p.details.updatedAt !== latest).length : players.length

  console.log('Coverage')
  console.log(`  scored (fame not null)      : ${scored.length} (${pct(scored.length)})`)
  console.log(`  never imported              : ${unscored} (${pct(unscored)})`)
  console.log(`  games > 0                   : ${withGames} (${pct(withGames)})`)
  // Memberships exist but no import has said how many games — the membership import predates
  // `memberships.games`, or the source has no count. Re-running that import fixes the former.
  console.log(`  memberships, games unknown  : ${gamesUnknown} (${pct(gamesUnknown)})`)
  console.log(`  international caps > 0      : ${withCaps} (${pct(withCaps)})`)
  // Scored but unreachable in a puzzle: a career, but no membership landed — usually club-name
  // matching failing during the import. A health check on the import as much as on fame.
  console.log(`  no memberships (unreachable): ${noMemberships} (${pct(noMemberships)})`)
  console.log(`  not refreshed by last import: ${stale} (${pct(stale)})${latest ? `  [latest ${latest}]` : ''}`)

  if (scored.length === 0) {
    console.error(`\nNothing scored yet — run the sport's seedFame step first.`)
    process.exit(1)
  }

  const sorted = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  const deciles = new Array(10).fill(0)
  for (const p of scored) deciles[Math.min(9, Math.floor((p.score ?? 0) / 10))]++
  const maxDecile = Math.max(...deciles)
  console.log('\nDistribution')
  deciles.forEach((count, i) => {
    console.log(
      `  ${String(i * 10).padStart(3)}-${String(i * 10 + 10).padEnd(3)} ${String(count).padStart(6)}  ${bar(count, maxDecile)}`,
    )
  })
  // Worth saying out loud: the percentile version this replaced was flat by construction, so a
  // lumpy histogram here is the expected shape of an absolute score, not a bug.
  console.log('  (not uniform, unlike a percentile score — the bottom is genuinely crowded:')
  console.log('   most players have a handful of games and no cap)')

  const line = (p: (typeof sorted)[number], rank: number) =>
    `  ${String(rank).padStart(5)}. ${String(p.score).padStart(3)}  ${p.name.padEnd(28).slice(0, 28)} ` +
    `games=${String(p.games ?? '-').padStart(4)} caps=${String(p.details.caps ?? 0).padStart(3)} ` +
    `seasons=${String(p.seasons).padStart(2)}`

  console.log(`\nTop ${TOP_N} — these should be household names`)
  sorted.slice(0, TOP_N).forEach((p, i) => console.log(line(p, i + 1)))

  console.log(`\nBottom ${TOP_N} — these should be players you have never heard of`)
  sorted.slice(-TOP_N).forEach((p, i) => console.log(line(p, sorted.length - TOP_N + i + 1)))

  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
