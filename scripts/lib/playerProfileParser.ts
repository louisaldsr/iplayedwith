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
 * Parses the season-by-season table under `#saison_ov` on a player's
 * allrugby.com profile page. That table stacks 3 sections (season detail,
 * career totals by competition, career totals by club) as separate `tbody`
 * siblings inside one `<table>` — only the first `tbody` is season data, so
 * we scope to it explicitly rather than walking every row in the table.
 *
 * Rows for the same season+club (e.g. Top 14 then Champions Cup) are
 * deduped, keeping only the first (which is always the top-tier domestic
 * competition). International/national-team rows are excluded entirely —
 * they aren't real clubs.
 */
export function parseCareerRows(html: string): CareerRow[] {
  const $ = cheerio.load(html)
  const tbody = $('#saison_ov table.JOverall > tbody').first()
  if (tbody.length === 0) return []

  const rows: CareerRow[] = []
  const seen = new Set<string>()

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
      currentClub = $(tds.get(offset + 1)).text().trim()
      currentIsInternational = isInternational
      offset += 2
    }

    if (currentIsInternational || !currentSeason || !currentClub) return

    const competition = $(tds.get(offset)).text().trim()
    const key = `${currentSeason}||${currentClub}`
    if (seen.has(key)) return
    seen.add(key)

    rows.push({ season: currentSeason, clubName: currentClub, competition })
  })

  return rows
}
