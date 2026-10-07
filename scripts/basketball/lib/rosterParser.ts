import * as cheerio from 'cheerio'

export type RosterEntry = {
  playerId: string
  /** Lower-case ISO-2 code from the flag icon, e.g. "fr" — birth country, as the site reports it. Null when absent. */
  countryCode: string | null
}

export type TeamSeasonPage = {
  /** The team's name THAT season — "Seattle SuperSonics", not the franchise's current name. */
  name: string
  logoUrl: string | null
  roster: RosterEntry[]
  /** Playoff games won that season — 0 for a team that missed them. */
  playoffWins: number
  /** Won the NBA Finals. */
  champion: boolean
}

/** "1985-86 Boston Celtics Roster and Stats" → "Boston Celtics". */
const HEADING = /^\d{4}-\d{2}\s+(.+?)\s+Roster and Stats$/

/**
 * Reads a team season page (`/teams/{abbr}/{year}.html`).
 *
 * The name comes from the page heading rather than from a franchise table, because the heading is
 * per season: a franchise that moved or was renamed reads correctly for every year without a
 * mapping to maintain.
 */
export function parseTeamPage(html: string): TeamSeasonPage {
  const $ = cheerio.load(html)

  const heading = $('h1').first().text().replace(/\s+/g, ' ').trim()
  const name = heading.match(HEADING)?.[1]
  if (!name) throw new Error(`Unrecognised team page heading "${heading}"`)

  const roster: RosterEntry[] = []
  $('table#roster tbody tr').each((_, tr) => {
    const row = $(tr)
    const playerId = row.find('[data-append-csv]').first().attr('data-append-csv')
    if (!playerId) return
    const flagClass = row.find('[data-stat="flag"] .f-i').attr('class') ?? ''
    const countryCode = flagClass.match(/\bf-([a-z]{2})\b/)?.[1] ?? null
    roster.push({ playerId, countryCode })
  })

  const playoffs = parsePlayoffs(
    $('p')
      .filter((_, p) => $(p).find('a[href^="/playoffs/NBA_"]').length > 0)
      .first()
      .text(),
  )

  return { name, logoUrl: $('img.teamlogo').first().attr('src') ?? null, roster, ...playoffs }
}

/** "Won NBA Western Conference Semifinals (4-3) versus …" — the team's own wins come first, won or lost. */
const SERIES = /(Won|Lost) (NBA [A-Za-z ]+?) \((\d+)-(\d+)\) versus/g

/**
 * The team's playoff run, from the summary line of its season page. Every series of 1979-80 to
 * 2025-26 reads as above: four rounds per conference, then the Finals — no play-in rows.
 */
export function parsePlayoffs(summary: string): { playoffWins: number; champion: boolean } {
  let playoffWins = 0
  let champion = false
  for (const [, result, series, wins] of summary.replace(/\s+/g, ' ').matchAll(SERIES)) {
    playoffWins += Number(wins)
    if (result === 'Won' && series === 'NBA Finals') champion = true
  }
  return { playoffWins, champion }
}
