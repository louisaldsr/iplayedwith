import { isSportId, SPORTS } from '@/domain/sport'
import { ChallengeDay, challengeDayOf } from '@/domain/dailyChallenge'
import { getDailyRanking } from '@/services/dailyResultService'
import { formatUsername } from '@/domain/visitorName'
import en from '@/i18n/en'
import fr from '@/i18n/fr'
import { getDb } from './env'

/**
 * Prints a day's ranking — server-side only until it has proven itself and gets a screen.
 *
 *   npm run daily:ranking -- --sport=rugby [--day=YYYY-MM-DD] [--lang=fr|en]
 *   (default: today in Paris, names in French)
 *
 * Won results only: fewest attempts first, then fastest. Visitors are anonymous browsers, shown
 * by their generated name and the start of their id — two visitors may share a name.
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

  const ranking = await getDailyRanking(getDb(), sport, day)
  console.log(`\n=== ${sport} — ${day} — ${ranking.length} won ===\n`)
  if (ranking.length === 0) return

  const NAME_WIDTH = 32
  console.log(`rank  ${'name'.padEnd(NAME_WIDTH)}  visitor   attempts  time      lives lost  links  hints`)
  for (const r of ranking) {
    console.log(
      [
        String(r.rank).padStart(4),
        (r.username ? formatUsername(r.username, labels) : '—').padEnd(NAME_WIDTH),
        r.visitorId.slice(0, 8),
        String(r.attempts).padStart(8),
        formatDuration(r.durationMs).padStart(8),
        String(r.livesLost).padStart(10),
        String(r.links).padStart(6),
        String(r.hints).padStart(5),
      ].join('  '),
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
