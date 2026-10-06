import * as cheerio from 'cheerio'

/**
 * One membership-to-be: a season at a club. `games` fills the `memberships.games` contract —
 * every competition line of that season at that club, summed; null when no line has a count.
 */
export type CareerRow = { season: string; clubName: string; competition: string; games: number | null }
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
 * `wins` is the first figure of the next column, "V/N/D" (wins, draws, losses: "8 0 4").
 * `starts` is "Titulaire", `minutes` the last column ("984'").
 */
export type CareerTableRow = Omit<CareerRow, 'games'> & {
  isInternational: boolean
  matches: number | null
  wins: number | null
  starts: number | null
  minutes: number | null
}

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
 * The column layout is `Saison | (logos) | Club | Compétition | Matchs | V/N/D | Titulaire | E |
 * D | P | T | Points | Cartons | Min.`, but the
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
      wins: parseWins($(tds.get(offset + 2)).text()),
      starts: parseCount($(tds.get(offset + 3)).text()),
      minutes: parseMinutes($(tds.get(offset + 10)).text()),
    })
  })

  return rows
}

/** "8 0 4" (wins, draws, losses) -> 8; anything else -> null. */
function parseWins(text: string): number | null {
  const match = text.trim().match(/^(\d+)\s+\d+\s+\d+$/)
  return match ? parseInt(match[1], 10) : null
}

/** "984'" -> 984; anything else -> null. */
function parseMinutes(text: string): number | null {
  const match = text.trim().match(/^(\d+)'?$/)
  return match ? parseInt(match[1], 10) : null
}

/** "12" -> 12; an empty, non-numeric or negative cell -> null. */
function parseCount(text: string): number | null {
  const match = text.trim().match(/^\d+$/)
  return match ? parseInt(match[0], 10) : null
}

/**
 * The player's club career: one row per season+club, national teams excluded.
 *
 * A season at a club is usually several lines — "Top 14: 12" then "Champions Cup: 4". They
 * collapse into one row: `competition` is the first line's (always the top-tier domestic one),
 * and `games` is the sum of ALL of them, because the membership contract counts every match
 * played for that club that season. International/national-team rows are excluded entirely —
 * they aren't clubs, and their matches are caps, read by `parseCareerStats`.
 */
export function parseCareerRows(html: string): CareerRow[] {
  const rows: CareerRow[] = []
  const bySeasonClub = new Map<string, CareerRow>()

  for (const row of walkCareerTable(html)) {
    if (row.isInternational) continue

    const key = `${row.season}||${row.clubName}`
    const existing = bySeasonClub.get(key)
    if (existing) {
      if (row.matches !== null) existing.games = (existing.games ?? 0) + row.matches
      continue
    }

    const created: CareerRow = {
      season: row.season,
      clubName: row.clubName,
      competition: row.competition,
      games: row.matches,
    }
    bySeasonClub.set(key, created)
    rows.push(created)
  }

  return rows
}

/** One competition line of a club season — "Toulouse · 23/24 · Champions Cup · 8 games, 8 wins". */
export type CompetitionRow = {
  season: string
  clubName: string
  competition: string
  matches: number | null
  wins: number | null
  starts: number | null
  minutes: number | null
}

/**
 * Every competition line of the player's club career, NOT collapsed: where `parseCareerRows`
 * keeps one row per season+club, this keeps "Top 14: 22" and "Champions Cup: 8" apart, which is
 * what the season prestige needs (scripts/rugby/lib/prestige.ts). National teams are excluded,
 * as in `parseCareerRows`.
 */
export function parseCompetitionRows(html: string): CompetitionRow[] {
  return walkCareerTable(html)
    .filter((row) => !row.isInternational)
    .map(({ season, clubName, competition, matches, wins, starts, minutes }) => ({
      season,
      clubName,
      competition,
      matches,
      wins,
      starts,
      minutes,
    }))
}

/**
 * The career table lists every national side a player turned out for, not only the senior one:
 * "France U20", "Angleterre A", "All Blacks XV", "France Développement", the Barbarians, the
 * Māori All Blacks. None of those are caps. Counting them handed youngsters a senior-looking
 * record — measured over the whole rugby roster: ~6,500 of ~42,700 counted "caps", mostly U20.
 *
 * Suffix rules rather than a list of countries: the senior team is the country's bare name
 * ("France", "Géorgie", "Nouvelle-Zélande"), so anything qualified is a second side. The
 * British & Irish Lions stay: their Tests are caps.
 */
const NON_SENIOR_SIDE = /(\sU\d{2}|\sA|\sXV|\sDéveloppement)$|Barbarians|Māori/i

export function isSeniorNationalTeam(label: string): boolean {
  return !NON_SENIOR_SIDE.test(label.trim())
}

/**
 * Raw fame signals read off a profile that memberships cannot carry — see src/domain/fame.ts.
 * `capsByNation` splits `caps` by national side, as the profile labels it ("France", "Géorgie"):
 * the fame score weighs a cap by its nation (`nation_tiers`).
 */
export type CareerStats = { caps: number; capsByNation: Record<string, number> }

/**
 * Counts senior international caps: the national-team lines of the career table ("Géorgie · Test
 * Matchs · 2"), which `parseCareerRows` drops because a country is not a club. Youth, A and
 * invitational sides are skipped — see `isSeniorNationalTeam`.
 *
 * Club games are not counted here: they belong to each membership (`parseCareerRows`), so the
 * fame score reads them from the same rows as the seasons they are divided by.
 */
export function parseCareerStats(html: string): CareerStats {
  let caps = 0
  const capsByNation: Record<string, number> = {}

  for (const row of walkCareerTable(html)) {
    if (row.isInternational && row.matches !== null && isSeniorNationalTeam(row.clubName)) {
      caps += row.matches
      capsByNation[row.clubName] = (capsByNation[row.clubName] ?? 0) + row.matches
    }
  }

  return { caps, capsByNation }
}

/** A club season's starts and minutes, every competition line summed — the `games` contract. */
export type SeasonStats = { season: string; clubName: string; starts: number | null; minutes: number | null }

/**
 * Starts and minutes per season+club, every competition line summed — the same lines
 * `parseCareerRows` sums into `games`, so the three describe the same membership. Null when no
 * line of that season+club gives the figure. National teams are excluded.
 */
export function parseSeasonStats(html: string): SeasonStats[] {
  const bySeasonClub = new Map<string, SeasonStats>()
  for (const row of walkCareerTable(html)) {
    if (row.isInternational) continue
    const key = `${row.season}||${row.clubName}`
    const stats = bySeasonClub.get(key) ?? { season: row.season, clubName: row.clubName, starts: null, minutes: null }
    if (row.starts !== null) stats.starts = (stats.starts ?? 0) + row.starts
    if (row.minutes !== null) stats.minutes = (stats.minutes ?? 0) + row.minutes
    bySeasonClub.set(key, stats)
  }
  return [...bySeasonClub.values()]
}

/**
 * The player's All.Rugby ID: the slug of the all.rugby page an allrugby.com profile links to
 * (`<link rel="alternate" hreflang="en" href="https://all.rugby/player/tom-wood">`), and an
 * all.rugby profile's own slug. It is the key Wikidata stores (P9903, "All.Rugby player ID") —
 * unlike our URL slug, it tells homonyms apart: the two Tom Woods are `tom-wood` and `tom-wood-`.
 */
export function parseAllRugbyId(html: string): string | null {
  const $ = cheerio.load(html)
  const href = $('link[rel="alternate"][hreflang="en"]').attr('href') ?? $('link[rel="canonical"]').attr('href') ?? ''
  const match = href.match(/^https:\/\/all\.rugby\/player\/([^/?#]+)$/)
  return match ? decodeURIComponent(match[1]) : null
}
