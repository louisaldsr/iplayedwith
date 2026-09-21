import * as cheerio from 'cheerio'

export type CareerRow = { season: string; clubName: string; competition: string }
export type PlayerIdentity = { rawName: string; rawNationality: string | null }

/**
 * Parses the player's name and nationality from the page's JSON-LD block
 * (`<script type="application/ld+json">`), which embeds a schema.org `Person`
 * alongside a `BreadcrumbList` under a shared `@graph`. `rawName` is as displayed
 * (e.g. "Bryan ARNAUD" — last name in caps) and `rawNationality` is a French
 * country name (e.g. "Afrique du sud"); callers are responsible for title-casing
 * the name and mapping the nationality to an ISO code.
 */
export function parsePlayerIdentity(html: string): PlayerIdentity | null {
  const $ = cheerio.load(html)
  let identity: PlayerIdentity | null = null

  $('script[type="application/ld+json"]').each((_, script) => {
    if (identity) return
    let parsed: unknown
    try {
      parsed = JSON.parse($(script).contents().text())
    } catch {
      return
    }
    const graph = (parsed as { '@graph'?: unknown[] })['@graph'] ?? []
    const person = graph.find(
      (node): node is { name?: unknown; nationality?: unknown } =>
        typeof node === 'object' && node !== null && (node as { '@type'?: unknown })['@type'] === 'Person',
    )
    if (!person || typeof person.name !== 'string') return
    identity = {
      rawName: person.name,
      rawNationality: typeof person.nationality === 'string' ? person.nationality : null,
    }
  })

  return identity
}

/**
 * True when a player has no registered season data — their profile's `#saisons` tab
 * strip only has the "Récapitulatif" (overview) placeholder tab (`saisonNav_ov`) and no
 * per-season tabs (`saisonNav_YYYY`), which on real profiles correlates exactly with an
 * empty `#saison_ov` table body. Used to reject amateur/no-career players before creating
 * a player row for them.
 */
export function hasNoProfessionalCareer(html: string): boolean {
  const $ = cheerio.load(html)
  return $('#saisons li[id^="saisonNav_"]').length <= 1
}

/**
 * "25/26" -> "2025-2026". allrugby only ever shows 2-digit years; treat
 * anything <= 49 as 20xx and the rest as 19xx (irrelevant in practice for
 * current-season player careers, but keeps old seasons from misparsing).
 */
function seasonToRange(text: string): string | null {
  const match = text.trim().match(/^(\d{2})\/(\d{2})$/)
  if (!match) return null
  const startTwoDigit = parseInt(match[1], 10)
  const century = startTwoDigit <= 49 ? 2000 : 1900
  const startYear = century + startTwoDigit
  return `${startYear}-${startYear + 1}`
}

/**
 * One row of the season table, before any filtering — a single (season, club, competition)
 * line, with the club/season carried over from the last `sepSaison`/`sepClub` row.
 *
 * `matches` is the table's "Matchs" column, or null when the cell is empty or unparseable.
 */
export type CareerTableRow = CareerRow & { isInternational: boolean; matches: number | null }

/**
 * Walks the season-by-season table under `#saison_ov` on a player's allrugby.com profile
 * page, emitting every line as-is.
 *
 * That table stacks 3 sections (season detail, career totals by competition, career totals
 * by club) as separate `tbody` siblings inside one `<table>` — only the first `tbody` is
 * season data, so we scope to it explicitly rather than walking every row in the table.
 * Scoping here is also what keeps the match counts honest: the other two tbodies hold the
 * same matches already summed, so a wider selector would double-count them.
 *
 * The column layout is `Saison | (logos) | Club | Compétition | Matchs | V/N/D | …`, but the
 * first three cells are only present on the row that opens a season or a club (they carry a
 * `rowspan` over the rows below) — hence the running `offset`.
 *
 * Callers do their own filtering: `parseCareerRows` wants one row per season+club and no
 * national teams, `parseCareerStats` wants every row and both kinds.
 */
function walkCareerTable(html: string): CareerTableRow[] {
  const $ = cheerio.load(html)
  const tbody = $('#saison_ov table.JOverall > tbody').first()
  if (tbody.length === 0) return []

  const rows: CareerTableRow[] = []

  let currentSeason: string | null = null
  let currentClub: string | null = null
  let currentIsInternational = false

  tbody.children('tr').each((_, tr) => {
    const $tr = $(tr)
    const cls = $tr.attr('class') || ''
    const isSepSaison = /\bsepSaison\b/.test(cls)
    const isSepClub = /\bsepClub\b/.test(cls)
    const isInternational = /\binternational\b/.test(cls)
    const tds = $tr.children('td')

    let offset = 0
    if (isSepSaison) {
      const parsed = seasonToRange($(tds.get(0)).text())
      if (parsed) currentSeason = parsed
      offset = 1
    }
    if (isSepSaison || isSepClub) {
      currentClub = $(tds.get(offset + 1))
        .text()
        .trim()
      currentIsInternational = isInternational
      offset += 2
    }

    if (!currentSeason || !currentClub) return

    rows.push({
      season: currentSeason,
      clubName: currentClub,
      competition: $(tds.get(offset)).text().trim(),
      isInternational: currentIsInternational,
      matches: parseCount($(tds.get(offset + 1)).text()),
    })
  })

  return rows
}

/** "12" -> 12; an empty, non-numeric or negative cell -> null. */
function parseCount(text: string): number | null {
  const match = text.trim().match(/^\d+$/)
  return match ? parseInt(match[0], 10) : null
}

/**
 * The player's club career: one row per season+club, national teams excluded.
 *
 * Rows for the same season+club (e.g. Top 14 then Champions Cup) are deduped, keeping only
 * the first (which is always the top-tier domestic competition). International/national-team
 * rows are excluded entirely — they aren't real clubs.
 */
export function parseCareerRows(html: string): CareerRow[] {
  const rows: CareerRow[] = []
  const seen = new Set<string>()

  for (const row of walkCareerTable(html)) {
    if (row.isInternational) continue

    const key = `${row.season}||${row.clubName}`
    if (seen.has(key)) continue
    seen.add(key)

    rows.push({ season: row.season, clubName: row.clubName, competition: row.competition })
  }

  return rows
}

/** Raw fame signals read off a profile — see src/domain/fame.ts. */
export type CareerStats = { games: number; caps: number }

/**
 * Counts matches played, as the fame metric's main signal.
 *
 * Note what this sums that `parseCareerRows` throws away: EVERY competition line of a season,
 * not just the first. A season at Clermont is "Top 14: 12 matchs" plus "Champions Cup: 4
 * matchs", and both count towards how much this player was actually seen playing — whereas
 * the membership import only needs to know he was at Clermont that year.
 *
 * `caps` comes from the same table's national-team lines ("Géorgie · Test Matchs · 2"),
 * which the membership import drops because a country is not a club. They are the best
 * available fame signal on the rugby side, so they are counted rather than discarded.
 */
export function parseCareerStats(html: string): CareerStats {
  let games = 0
  let caps = 0

  for (const row of walkCareerTable(html)) {
    if (row.matches === null) continue
    if (row.isInternational) caps += row.matches
    else games += row.matches
  }

  return { games, caps }
}
