/**
 * @jest-environment node
 *
 * Not jsdom, which is the suite's default: under a browser environment Jest resolves cheerio
 * to its ESM browser build and cannot parse it. These parsers only ever run in a seed script,
 * so node is also the honest environment for them.
 */
import { parseCareerRows, parseCareerStats } from '../../../scripts/rugby/lib/playerProfileParser'

/**
 * Faithful but reduced copies of an allrugby.com profile's `#saison_ov` table.
 *
 * The column layout is the real one — `Saison | (logos) | Club | Compétition | Matchs | V/N/D |
 * Titulaire | … | Min.` — because the parser reads the match count by position, so a fixture
 * with the columns collapsed would test nothing.
 */
const CELLS_AFTER_MATCHES = "<td>8 0 4</td><td>9</td><td></td><td></td><td></td><td></td><td></td><td>590'</td>"

const seasonRow = (season: string, club: string, competition: string, matches: string, cls = 'sepSaison') =>
  `<tr class="${cls}">` +
  `<td class="gras tdsaison" rowspan="2">${season}</td>` +
  `<td rowspan="2"><img src="/img/logo/clubs/20/x.png" alt="logo ${club}"/></td>` +
  `<td rowspan="2" class="tdclub"> ${club} </td>` +
  `<td>${competition}</td><td>${matches}</td>${CELLS_AFTER_MATCHES}</tr>`

/** A further competition inside the season opened above — no season/club cells of its own. */
const competitionRow = (competition: string, matches: string) =>
  `<tr class=""><td>${competition}</td><td>${matches}</td>${CELLS_AFTER_MATCHES}</tr>`

/** A new club inside the season above: carries club cells but no season cell. */
const clubRow = (club: string, competition: string, matches: string, cls = 'sepClub') =>
  `<tr class="${cls}">` +
  `<td rowspan="1"><img src="/img/logo/clubs/20/x.png" alt="logo ${club}"/></td>` +
  `<td rowspan="1" class="tdclub"> ${club} </td>` +
  `<td>${competition}</td><td>${matches}</td>${CELLS_AFTER_MATCHES}</tr>`

const profile = (...tbodies: string[]) =>
  `<html><body><div id="saison_ov" class="saison ">` +
  `<table class="rtable JOverall"><thead><tr><th>Saison</th><th></th><th>Club</th>` +
  `<th>Compétition</th><th>Matchs</th></tr></thead>` +
  tbodies.map((rows) => `<tbody>${rows}</tbody>`).join('') +
  `</table></div></body></html>`

describe('parseCareerStats', () => {
  it('sums every competition of a season, not just the top-tier one', () => {
    // The exact case parseCareerRows collapses: one Clermont season is Top 14 + Champions Cup.
    const html = profile(seasonRow('19/20', 'Clermont', 'Top 14', '12') + competitionRow('Champions Cup', '4'))
    expect(parseCareerStats(html)).toEqual({ games: 16, caps: 0 })
  })

  it('sums across seasons and clubs', () => {
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12') +
        seasonRow('18/19', 'Clermont', 'Top 14', '20') +
        competitionRow('Challenge Cup', '3'),
    )
    expect(parseCareerStats(html).games).toBe(35)
  })

  it('counts national-team rows as caps, and keeps them out of games', () => {
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12') + clubRow('Géorgie', 'Test Matchs', '2', 'international sepClub'),
    )
    expect(parseCareerStats(html)).toEqual({ games: 12, caps: 2 })
  })

  it('keeps counting club games after a national-team row', () => {
    // The international flag is carried until the next club row; if it leaked, the club games
    // below would silently land in caps.
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12') +
        clubRow('France', 'Autumn Nations Series', '2', 'international sepClub') +
        seasonRow('18/19', 'Clermont', 'Top 14', '20'),
    )
    expect(parseCareerStats(html)).toEqual({ games: 32, caps: 2 })
  })

  it('ignores the career-total tbodies that follow the season detail', () => {
    // The table stacks 3 tbodies; the 2nd and 3rd hold the same matches already summed, so a
    // wider selector would roughly triple every count.
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12'),
      seasonRow('', 'Top 14', 'Total', '12'),
      seasonRow('', 'Clermont', 'Total', '12'),
    )
    expect(parseCareerStats(html).games).toBe(12)
  })

  it('skips an empty or non-numeric match count rather than producing NaN', () => {
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '') +
        seasonRow('18/19', 'Clermont', 'Top 14', '-') +
        seasonRow('17/18', 'Clermont', 'Top 14', '7'),
    )
    expect(parseCareerStats(html).games).toBe(7)
  })

  it('returns zeros for a profile with no season table', () => {
    expect(parseCareerStats('<html><body>no career here</body></html>')).toEqual({ games: 0, caps: 0 })
  })
})

/**
 * `parseCareerStats` was added by extracting a shared row walker out of `parseCareerRows`.
 * These lock the membership import's input, which is what that refactor put at risk.
 */
describe('parseCareerRows', () => {
  it('keeps one row per season+club, with the first competition listed', () => {
    const html = profile(seasonRow('19/20', 'Clermont', 'Top 14', '12') + competitionRow('Champions Cup', '4'))
    expect(parseCareerRows(html)).toEqual([{ season: '2019-2020', clubName: 'Clermont', competition: 'Top 14' }])
  })

  it('excludes national teams', () => {
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12') + clubRow('Géorgie', 'Test Matchs', '2', 'international sepClub'),
    )
    expect(parseCareerRows(html).map((r) => r.clubName)).toEqual(['Clermont'])
  })

  it('keeps both clubs of a mid-season move', () => {
    const html = profile(seasonRow('19/20', 'Clermont', 'Top 14', '12') + clubRow('Racing 92', 'Top 14', '6'))
    expect(parseCareerRows(html)).toEqual([
      { season: '2019-2020', clubName: 'Clermont', competition: 'Top 14' },
      { season: '2019-2020', clubName: 'Racing 92', competition: 'Top 14' },
    ])
  })

  it('converts the 2-digit season to a full range', () => {
    const html = profile(seasonRow('99/00', 'Clermont', 'Top 14', '12'))
    expect(parseCareerRows(html)[0].season).toBe('1999-2000')
  })

  it('returns nothing for a profile with no season table', () => {
    expect(parseCareerRows('<html><body>no career here</body></html>')).toEqual([])
  })
})
