/**
 * @jest-environment node
 *
 * Not jsdom, which is the suite's default: under a browser environment Jest resolves cheerio
 * to its ESM browser build and cannot parse it. These parsers only ever run in a seed script,
 * so node is also the honest environment for them.
 */
import {
  isSeniorNationalTeam,
  parseAllRugbyId,
  parseCareerRows,
  parseCareerStats,
  parseSeasonStats,
} from '../../../scripts/rugby/lib/playerProfileParser'

/**
 * Faithful but reduced copies of an allrugby.com profile's `#saison_ov` table.
 *
 * The column layout is the real one — `Saison | (logos) | Club | Compétition | Matchs | V/N/D |
 * Titulaire | … | Min.` — because the parser reads the match count by position, so a fixture
 * with the columns collapsed would test nothing.
 */
const CELLS_AFTER_MATCHES =
  "<td>8 0 4</td><td>9</td><td></td><td></td><td></td><td></td><td></td><td></td><td>590'</td>"

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
  it('counts national-team rows as caps', () => {
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12') + clubRow('Géorgie', 'Test Matchs', '2', 'international sepClub'),
    )
    expect(parseCareerStats(html).caps).toBe(2)
  })

  it('sums caps across seasons', () => {
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12') +
        clubRow('France', 'Six Nations', '5', 'international sepClub') +
        seasonRow('18/19', 'Clermont', 'Top 14', '20') +
        clubRow('France', 'Autumn Nations Series', '3', 'international sepClub'),
    )
    expect(parseCareerStats(html).caps).toBe(8)
  })

  it('never counts club games as caps, even right after a national-team row', () => {
    // The international flag is carried until the next club row; if it leaked, the club games
    // below would silently land in caps.
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12') +
        clubRow('France', 'Autumn Nations Series', '2', 'international sepClub') +
        seasonRow('18/19', 'Clermont', 'Top 14', '20'),
    )
    expect(parseCareerStats(html).caps).toBe(2)
  })

  it('ignores the career-total tbodies that follow the season detail', () => {
    // The table stacks 3 tbodies; the 2nd and 3rd hold the same matches already summed, so a
    // wider selector would roughly triple every count.
    const html = profile(
      clubRow('France', 'Six Nations', '5', 'international sepClub'),
      clubRow('France', 'Total', '5', 'international sepClub'),
    )
    expect(parseCareerStats(html).caps).toBe(0)
  })

  it('skips youth, A and invitational sides — only senior Tests are caps', () => {
    const html = profile(
      seasonRow('24/25', 'Toulouse', 'Top 14', '12') +
        clubRow('France U20', 'Championnat du Monde U20', '5', 'international sepClub') +
        clubRow('France', 'Tournoi des 6 Nations', '3', 'international sepClub') +
        seasonRow('23/24', 'Toulouse', 'Top 14', '20') +
        clubRow('Barbarians FR', 'Test Matchs', '1', 'international sepClub'),
    )
    expect(parseCareerStats(html).caps).toBe(3)
  })

  it('returns zero caps for a profile with no season table', () => {
    expect(parseCareerStats('<html><body>no career here</body></html>').caps).toBe(0)
  })
})

describe('isSeniorNationalTeam', () => {
  it.each(['France', 'Nouvelle-Zélande', 'Afrique du Sud', 'Géorgie', 'USA', 'Lions'])(
    '%s is a senior side',
    (label) => {
      expect(isSeniorNationalTeam(label)).toBe(true)
    },
  )

  it.each([
    'France U20',
    'Nouvelle-Zélande U20',
    'Angleterre A',
    'Afrique du Sud A',
    'All Blacks XV',
    'France Développement',
    'Barbarians',
    'Barbarians FR',
    'Māori All Blacks',
  ])('%s is not', (label) => {
    expect(isSeniorNationalTeam(label)).toBe(false)
  })
})

/**
 * The membership import's input: one row per season+club, with `games` filling the
 * `memberships.games` contract — every match for that club that season, all competitions.
 */
describe('parseCareerRows', () => {
  it('keeps one row per season+club, with the first competition and ALL its matches', () => {
    // One Clermont season is Top 14 + Champions Cup: one membership, 16 games.
    const html = profile(seasonRow('19/20', 'Clermont', 'Top 14', '12') + competitionRow('Champions Cup', '4'))
    expect(parseCareerRows(html)).toEqual([
      { season: '2019-2020', clubName: 'Clermont', competition: 'Top 14', games: 16 },
    ])
  })

  it('keeps each season its own games', () => {
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12') +
        seasonRow('18/19', 'Clermont', 'Top 14', '20') +
        competitionRow('Challenge Cup', '3'),
    )
    expect(parseCareerRows(html).map((r) => [r.season, r.games])).toEqual([
      ['2019-2020', 12],
      ['2018-2019', 23],
    ])
  })

  it('excludes national teams, and their matches never reach a club', () => {
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12') + clubRow('Géorgie', 'Test Matchs', '2', 'international sepClub'),
    )
    expect(parseCareerRows(html)).toEqual([
      { season: '2019-2020', clubName: 'Clermont', competition: 'Top 14', games: 12 },
    ])
  })

  it('keeps both clubs of a mid-season move, each with its own games', () => {
    const html = profile(seasonRow('19/20', 'Clermont', 'Top 14', '12') + clubRow('Racing 92', 'Top 14', '6'))
    expect(parseCareerRows(html)).toEqual([
      { season: '2019-2020', clubName: 'Clermont', competition: 'Top 14', games: 12 },
      { season: '2019-2020', clubName: 'Racing 92', competition: 'Top 14', games: 6 },
    ])
  })

  it('reports null games when no line of the season has a count, not 0', () => {
    // null = the source does not say; 0 would claim he played no match.
    const html = profile(seasonRow('19/20', 'Clermont', 'Top 14', '') + competitionRow('Champions Cup', '-'))
    expect(parseCareerRows(html)[0].games).toBeNull()
  })

  it('sums the lines that do have a count when others are empty', () => {
    const html = profile(seasonRow('19/20', 'Clermont', 'Top 14', '') + competitionRow('Champions Cup', '4'))
    expect(parseCareerRows(html)[0].games).toBe(4)
  })

  it('ignores the career-total tbodies that follow the season detail', () => {
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12'),
      seasonRow('', 'Top 14', 'Total', '12'),
      seasonRow('', 'Clermont', 'Total', '12'),
    )
    expect(parseCareerRows(html)).toEqual([
      { season: '2019-2020', clubName: 'Clermont', competition: 'Top 14', games: 12 },
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

describe('parseCareerStats — caps by nation', () => {
  it('splits the senior caps by national side, as the profile labels it', () => {
    const html = profile(
      seasonRow('19/20', 'Clermont', 'Top 14', '12') +
        clubRow('Géorgie', 'Test Matchs', '2', 'international sepClub') +
        seasonRow('20/21', 'Clermont', 'Top 14', '10') +
        clubRow('Géorgie', 'Test Matchs', '5', 'international sepClub') +
        clubRow('Lions', 'Test Matchs', '1', 'international sepClub') +
        clubRow('Géorgie U20', 'Championnat du Monde U20', '4', 'international sepClub'),
    )
    expect(parseCareerStats(html)).toEqual({ caps: 8, capsByNation: { Géorgie: 7, Lions: 1 } })
  })
})

describe('parseSeasonStats', () => {
  // The real layout — `Compétition | Matchs | V/N/D | Titulaire | E | D | P | T | Points | Cartons | Min.`.
  const row = (competition: string, matches: string, starts: string, minutes: string) =>
    `<td>${competition}</td><td>${matches}</td><td>8 0 4</td><td>${starts}</td>` +
    `<td></td><td></td><td></td><td></td><td></td><td></td><td>${minutes}</td>`
  const html = (rows: string) =>
    `<html><body><div id="saison_ov"><table class="rtable JOverall"><tbody>${rows}</tbody></table></div></body></html>`

  it('sums starts and minutes over every competition line of a season at a club', () => {
    const page = html(
      `<tr class="sepSaison"><td class="tdsaison" rowspan="2">23/24</td><td rowspan="2"></td>` +
        `<td rowspan="2" class="tdclub"> Toulouse </td>${row('Top 14', '18', '13', "984'")}</tr>` +
        `<tr class="">${row('Champions Cup', '6', '3', "305'")}</tr>`,
    )
    expect(parseSeasonStats(page)).toEqual([{ season: '2023-2024', clubName: 'Toulouse', starts: 16, minutes: 1289 }])
  })

  it('keeps a figure the profile does not give as null, not 0', () => {
    const page = html(
      `<tr class="sepSaison"><td class="tdsaison" rowspan="1">23/24</td><td rowspan="1"></td>` +
        `<td rowspan="1" class="tdclub"> Toulouse </td>${row('Top 14', '3', '', '')}</tr>`,
    )
    expect(parseSeasonStats(page)).toEqual([{ season: '2023-2024', clubName: 'Toulouse', starts: null, minutes: null }])
  })

  it('leaves the national teams out', () => {
    const page = html(
      `<tr class="sepSaison international"><td class="tdsaison" rowspan="1">23/24</td><td rowspan="1"></td>` +
        `<td rowspan="1" class="tdclub"> France </td>${row('Test Matchs', '9', '9', "720'")}</tr>`,
    )
    expect(parseSeasonStats(page)).toEqual([])
  })
})

describe('parseAllRugbyId', () => {
  const head = (links: string) => `<html><head>${links}</head><body></body></html>`

  it('reads the all.rugby slug an allrugby.com profile links to', () => {
    const html = head(
      '<link rel="alternate" href="https://www.allrugby.com/joueurs/tom-wood-2109.html" hreflang="fr"/>' +
        '<link rel="alternate" href="https://all.rugby/player/tom-wood" hreflang="en"/>',
    )
    expect(parseAllRugbyId(html)).toBe('tom-wood')
  })

  it('keeps the trailing hyphen that tells homonyms apart, and decodes accents', () => {
    expect(
      parseAllRugbyId(head('<link rel="alternate" href="https://all.rugby/player/tom-wood-" hreflang="en"/>')),
    ).toBe('tom-wood-')
    expect(
      parseAllRugbyId(
        head('<link rel="alternate" href="https://all.rugby/player/aur%C3%A9lien-rougerie" hreflang="en"/>'),
      ),
    ).toBe('aurélien-rougerie')
  })

  it('returns null when the page links to no all.rugby player', () => {
    expect(parseAllRugbyId(head('<link rel="alternate" href="https://www.allrugby.com/rss/rss.xml"/>'))).toBeNull()
  })
})
