/**
 * @jest-environment node
 *
 * Node, for cheerio — see rugbyCareerStats.test.ts.
 */
import { parseCompetitionRows } from '../../../scripts/rugby/lib/playerProfileParser'
import { continentalCompetitionOf, createSquadRunCollector } from '../../../scripts/rugby/lib/prestige'

describe('continentalCompetitionOf', () => {
  it('folds every spelling of the European cups onto one name', () => {
    expect(continentalCompetitionOf('Champions Cup')).toBe('Champions Cup')
    expect(continentalCompetitionOf('H CUP')).toBe('Champions Cup')
    expect(continentalCompetitionOf('Heineken Cup')).toBe('Champions Cup')
    expect(continentalCompetitionOf('Challenge Européen')).toBe('Challenge Cup')
    expect(continentalCompetitionOf('European Challenge Cup')).toBe('Challenge Cup')
  })

  it('counts the COVID-era Super Rugby competitions as Super Rugby', () => {
    expect(continentalCompetitionOf('Super Rugby Pacific')).toBe('Super Rugby')
    expect(continentalCompetitionOf('Super Rugby Aotearoa')).toBe('Super Rugby')
    expect(continentalCompetitionOf('Super Rugby Trans-Tasman')).toBe('Super Rugby')
  })

  it('leaves out domestic competitions and the one-offs', () => {
    expect(continentalCompetitionOf('Top 14')).toBeNull()
    expect(continentalCompetitionOf('Premiership Rugby Cup')).toBeNull()
    expect(continentalCompetitionOf('Super Rugby Unlocked')).toBeNull()
    expect(continentalCompetitionOf('Rainbow Cup')).toBeNull()
  })
})

describe('createSquadRunCollector', () => {
  const row = (clubId: string, season: string, competition: string, wins: number | null) => ({
    clubId,
    season,
    competition,
    wins,
  })

  it('takes the most wins any squad member took part in as the club’s run', () => {
    const collector = createSquadRunCollector()
    collector.addPlayer([row('toulouse', '2023-2024', 'Champions Cup', 8), row('toulouse', '2023-2024', 'Top 14', 22)])
    collector.addPlayer([row('toulouse', '2023-2024', 'Champions Cup', 3)])
    expect(collector.runs()).toEqual([{ clubId: 'toulouse', season: '2023-2024', wins: { 'Champions Cup': 8 } }])
  })

  it('sums one player’s lines of the same competition first', () => {
    // Super Rugby Aotearoa then Trans-Tasman, the same season: one Super Rugby season of 5 wins.
    const collector = createSquadRunCollector()
    collector.addPlayer([
      row('highlanders', '2020-2021', 'Super Rugby Aotearoa', 1),
      row('highlanders', '2020-2021', 'Super Rugby Trans-Tasman', 4),
    ])
    collector.addPlayer([row('highlanders', '2020-2021', 'Super Rugby Aotearoa', 3)])
    expect(collector.runs()).toEqual([{ clubId: 'highlanders', season: '2020-2021', wins: { 'Super Rugby': 5 } }])
  })

  it('keeps clubs, seasons and competitions apart, and drops runs without a win', () => {
    // Zebre 2016-17: six Champions Cup games, no win — no run at all, which is the point of
    // counting wins.
    const collector = createSquadRunCollector()
    collector.addPlayer([
      row('leinster', '2017-2018', 'Champions Cup', 9),
      row('leinster', '2018-2019', 'Champions Cup', 0),
      row('bath', '2017-2018', 'Challenge Cup', null),
      row('bath', '2024-2025', 'Challenge Cup', 7),
    ])
    expect(collector.runs()).toEqual(
      expect.arrayContaining([
        { clubId: 'leinster', season: '2017-2018', wins: { 'Champions Cup': 9 } },
        { clubId: 'bath', season: '2024-2025', wins: { 'Challenge Cup': 7 } },
      ]),
    )
    expect(collector.runs()).toHaveLength(2)
  })
})

describe('parseCompetitionRows', () => {
  // The real column layout, as in rugbyCareerStats.test.ts: the parser reads by position —
  // `Compétition | Matchs | V/N/D | Titulaire | …`.
  const after = (wdl: string) =>
    `<td>${wdl}</td><td>9</td><td></td><td></td><td></td><td></td><td></td><td></td><td>590'</td>`
  const seasonRow = (season: string, club: string, competition: string, matches: string, wdl: string) =>
    `<tr class="sepSaison"><td class="gras tdsaison" rowspan="2">${season}</td>` +
    `<td rowspan="2"><img alt="logo ${club}"/></td><td rowspan="2" class="tdclub"> ${club} </td>` +
    `<td>${competition}</td><td>${matches}</td>${after(wdl)}</tr>`
  const competitionRow = (competition: string, matches: string, wdl: string) =>
    `<tr class=""><td>${competition}</td><td>${matches}</td>${after(wdl)}</tr>`
  const clubRow = (club: string, competition: string, matches: string, wdl: string, cls = 'sepClub') =>
    `<tr class="${cls}"><td rowspan="1"><img alt="logo ${club}"/></td><td rowspan="1" class="tdclub"> ${club} </td>` +
    `<td>${competition}</td><td>${matches}</td>${after(wdl)}</tr>`
  const profile = (rows: string) =>
    `<html><body><div id="saison_ov"><table class="rtable JOverall"><thead><tr><th>Saison</th></tr></thead>` +
    `<tbody>${rows}</tbody><tbody>${seasonRow('23/24', 'Toulouse', 'Champions Cup', '99', '99 0 0')}</tbody>` +
    `</table></div></body></html>`

  it('keeps every competition line apart, with its season, club and wins', () => {
    const html = profile(
      seasonRow('23/24', 'Toulouse', 'Top 14', '22', '17 1 4') +
        competitionRow('Champions Cup', '8', '8 0 0') +
        clubRow('France', 'Test Matchs', '9', '7 0 2', 'international sepClub'),
    )
    expect(parseCompetitionRows(html)).toEqual([
      {
        season: '2023-2024',
        clubName: 'Toulouse',
        competition: 'Top 14',
        matches: 22,
        wins: 17,
        starts: 9,
        minutes: 590,
      },
      {
        season: '2023-2024',
        clubName: 'Toulouse',
        competition: 'Champions Cup',
        matches: 8,
        wins: 8,
        starts: 9,
        minutes: 590,
      },
    ])
  })

  it('reads no wins from a malformed W/D/L cell rather than a wrong number', () => {
    const html = profile(seasonRow('23/24', 'Toulouse', 'Champions Cup', '8', ''))
    expect(parseCompetitionRows(html)).toEqual([
      {
        season: '2023-2024',
        clubName: 'Toulouse',
        competition: 'Champions Cup',
        matches: 8,
        wins: null,
        starts: 9,
        minutes: 590,
      },
    ])
  })
})
