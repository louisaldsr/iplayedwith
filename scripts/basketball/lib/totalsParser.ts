import * as cheerio from 'cheerio'

export type SeasonPhase = 'regular' | 'playoffs'

/** One player's games for one team in one phase of a season. */
export type TotalsRow = {
  /** Basketball-Reference's player slug, e.g. "jordami01" — stable across every page of the site. */
  playerId: string
  name: string
  teamAbbr: string
  phase: SeasonPhase
  games: number
}

const TABLES: Record<string, SeasonPhase> = {
  totals_stats: 'regular',
  totals_stats_post: 'playoffs',
}

/** `/teams/BOS/1986.html` → "BOS". */
const TEAM_HREF = /^\/teams\/([A-Z0-9]+)\/\d{4}\.html$/

/**
 * Reads a season totals page (`/leagues/NBA_{year}_totals.html`).
 *
 * A player traded mid-season has one row per team PLUS aggregate rows (`2TM`, `3TM`, and a
 * league-average row on recent pages). Only per-team rows link to a team page, so "the team cell
 * has a team link" is what keeps a row — the aggregates drop out without a list of their labels
 * to maintain.
 *
 * Throws on a row it cannot read (no player id, a non-numeric games count) instead of skipping
 * it: a column moving on the source would otherwise quietly thin the dataset.
 */
export function parseTotalsPage(html: string): TotalsRow[] {
  const $ = cheerio.load(html)
  const rows: TotalsRow[] = []

  for (const [tableId, phase] of Object.entries(TABLES)) {
    $(`table#${tableId} tbody tr`).each((_, tr) => {
      const row = $(tr)
      const href = row.find('a[href^="/teams/"]').attr('href')
      const teamAbbr = href?.match(TEAM_HREF)?.[1]
      if (!teamAbbr) return

      const playerCell = row.find('[data-append-csv]').first()
      const playerId = playerCell.attr('data-append-csv')
      const name = playerCell
        .text()
        .trim()
        .replace(/\s*\*$/, '')
      const gamesText = row.find('[data-stat="games"]').text().trim()
      if (!playerId || !name) throw new Error(`${tableId}: a ${teamAbbr} row has no player id or name`)
      if (!/^\d+$/.test(gamesText)) {
        throw new Error(`${tableId}: ${playerId} (${teamAbbr}) has an unreadable games count "${gamesText}"`)
      }

      rows.push({ playerId, name, teamAbbr, phase, games: Number(gamesText) })
    })
  }

  return rows
}
