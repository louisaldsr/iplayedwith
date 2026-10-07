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

  return { name, logoUrl: $('img.teamlogo').first().attr('src') ?? null, roster }
}
