import { isSportId, SPORTS } from '@/domain/sport'
import { ChallengeDay, challengeDayOf } from '@/domain/dailyChallenge'
import { getDailyRanking } from '@/services/dailyResultService'
import { formatUsername } from '@/domain/visitorName'
import { formatScore } from '@/domain/dailyScore'
import { FameFloorKey, fameFloorKey, fameFloorOf } from '@/domain/fameFloor'
import { PlayerId } from '@/domain/ids'
import { findFameScore } from '@/repositories/playersRepository'
import en from '@/i18n/en'
import fr from '@/i18n/fr'
import { getDb } from './env'

/**
 * Prints a day's ranking — server-side only until it has proven itself and gets a screen.
 *
 *   npm run daily:ranking -- --sport=rugby [--day=YYYY-MM-DD] [--lang=fr|en]
 *   (default: today in Paris, names in French)
 *
 * Every finished result: winners by score (extra players), then fastest; then everyone who lost,
 * on one shared rank. Visitors are anonymous browsers, shown by their username and the start of
 * their id.
 *
 * "chain u/k/f" counts the unsung / known / famous players in the middle of each winning chain (A
 * and B excepted), at today's fame — not ranked, it is there to decide whether fame should be.
 */
function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

async function main() {
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const sport = arg('sport')
  if (!sport || !isSportId(sport)) {
    console.error(`Usage: daily:ranking -- --sport=<${SPORTS.join('|')}> [--day=YYYY-MM-DD]`)
    process.exit(1)
  }
  const day = arg('day') ? ChallengeDay(arg('day')!) : challengeDayOf(new Date())
  const labels = (arg('lang') === 'en' ? en : fr).visitorNames

  const db = getDb()
  const ranking = await getDailyRanking(db, sport, day)
  const won = ranking.filter((r) => r.outcome === 'won').length
  console.log(`\n=== ${sport} — ${day} — ${won} won, ${ranking.length - won} lost ===\n`)
  if (ranking.length === 0) return

  const middles = (path: string[]) => path.slice(1, -1)
  const ids = [...new Set(ranking.flatMap((r) => middles(r.pathPlayerIds ?? [])))]
  const floors = new Map<string, FameFloorKey | null>()
  await Promise.all(
    ids.map(async (id) => {
      const floor = fameFloorOf(await findFameScore(db, sport, PlayerId(id)))
      floors.set(id, floor === null ? null : fameFloorKey(floor))
    }),
  )
  const chainFame = (path: string[] | null) => {
    if (!path) return '—'
    const count = (key: FameFloorKey) => middles(path).filter((id) => floors.get(id) === key).length
    return `${count('unsung')}/${count('known')}/${count('famous')}`
  }

  const NAME_WIDTH = 32
  console.log(
    `rank  ${'name'.padEnd(NAME_WIDTH)}  visitor    score  added  needed  time      lives lost  hints  chain u/k/f`,
  )
  for (const r of ranking) {
    console.log(
      [
        String(r.rank).padStart(4),
        (r.username ? formatUsername(r.username, labels) : '—').padEnd(NAME_WIDTH),
        r.visitorId.slice(0, 8),
        (r.score === null ? 'Failed' : formatScore(r.score, 'Perfect')).padStart(7),
        String(r.added).padStart(5),
        String(r.needed).padStart(6),
        formatDuration(r.durationMs).padStart(8),
        String(r.livesLost).padStart(10),
        String(r.hints).padStart(5),
        chainFame(r.pathPlayerIds).padStart(11),
      ].join('  '),
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
