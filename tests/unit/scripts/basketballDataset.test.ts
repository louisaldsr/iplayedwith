/**
 * @jest-environment node
 *
 * Not jsdom: under a browser environment Jest resolves cheerio to its ESM browser build and
 * cannot parse it (same as rugbyCareerStats.test.ts).
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildDataset, firstEndYear, lastEndYear, seasonFromEndYear } from '../../../scripts/basketball/lib/dataset'
import { parseTeamPage, type TeamSeasonPage } from '../../../scripts/basketball/lib/rosterParser'
import { parseTotalsPage, type TotalsRow } from '../../../scripts/basketball/lib/totalsParser'
import { LATEST_SEASON } from '@/domain/season'

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '../../fixtures/basketball', name), 'utf8')

describe('parseTotalsPage', () => {
  const rows = parseTotalsPage(fixture('totals.html'))

  it('keeps one row per (player, team, phase) and drops the 2TM aggregate and league-average rows', () => {
    expect(rows.filter((r) => r.playerId === 'siakapa01')).toEqual([
      { playerId: 'siakapa01', name: 'Pascal Siakam', teamAbbr: 'TOR', phase: 'regular', games: 39 },
      { playerId: 'siakapa01', name: 'Pascal Siakam', teamAbbr: 'IND', phase: 'regular', games: 41 },
      { playerId: 'siakapa01', name: 'Pascal Siakam', teamAbbr: 'IND', phase: 'playoffs', games: 17 },
    ])
    expect(rows).toHaveLength(6)
  })

  it('reads the playoffs table as its own phase', () => {
    expect(rows.filter((r) => r.playerId === 'davisan02').map((r) => [r.phase, r.games])).toEqual([
      ['regular', 76],
      ['playoffs', 5],
    ])
  })

  it('strips the Hall of Fame asterisk from names', () => {
    expect(rows.find((r) => r.playerId === 'jordami01')?.name).toBe('Michael Jordan')
  })

  it('throws on an unreadable games count instead of skipping the row', () => {
    const broken = fixture('totals.html').replace('data-stat="games">76<', 'data-stat="games">DNP<')
    expect(() => parseTotalsPage(broken)).toThrow(/davisan02.*unreadable games/)
  })
})

describe('parseTeamPage', () => {
  const team = parseTeamPage(fixture('team.html'))

  it('takes the season-specific team name from the heading', () => {
    expect(team.name).toBe('Boston Celtics')
  })

  it('reads the logo and every roster row, with the flag code when there is one', () => {
    expect(team.logoUrl).toBe('https://cdn.ssref.net/req/202609170/tlogo/bbr/BOS-1986.png')
    expect(team.roster).toEqual([
      { playerId: 'aingeda01', countryCode: 'us' },
      { playerId: 'parisro01', countryCode: null },
      { playerId: 'wedmasc01', countryCode: 'fr' },
    ])
  })

  it('throws on a heading it does not recognise', () => {
    expect(() => parseTeamPage('<h1>Franchise Index</h1>')).toThrow(/Unrecognised team page heading/)
  })
})

describe('season range', () => {
  it('maps Basketball-Reference end years to seasons', () => {
    expect(seasonFromEndYear(1980)).toBe('1979-1980')
    expect(firstEndYear()).toBe(1980)
    expect(seasonFromEndYear(lastEndYear())).toBe(LATEST_SEASON)
  })
})

describe('buildDataset', () => {
  const team = (name: string, roster: TeamSeasonPage['roster'] = []): TeamSeasonPage => ({
    name,
    logoUrl: `https://logo/${name}.png`,
    roster,
  })
  const row = (
    playerId: string,
    teamAbbr: string,
    games: number,
    phase: TotalsRow['phase'] = 'regular',
  ): TotalsRow => ({
    playerId,
    name: playerId.toUpperCase(),
    teamAbbr,
    phase,
    games,
  })

  it('sums regular season and playoff games into one membership per team', () => {
    const { dataset } = buildDataset([
      {
        endYear: 1991,
        totals: [row('jordami01', 'CHI', 82), row('jordami01', 'CHI', 17, 'playoffs')],
        teams: new Map([['CHI', team('Chicago Bulls')]]),
      },
    ])

    expect(dataset.memberships).toEqual([
      {
        playerSourceId: 'jordami01',
        clubSourceId: 'Chicago Bulls',
        season: '1990-1991',
        competition: 'NBA',
        games: 99,
      },
    ])
  })

  it('keeps a traded player as two memberships in the same season', () => {
    const { dataset } = buildDataset([
      {
        endYear: 2024,
        totals: [row('siakapa01', 'TOR', 39), row('siakapa01', 'IND', 41)],
        teams: new Map([
          ['TOR', team('Toronto Raptors')],
          ['IND', team('Indiana Pacers')],
        ]),
      },
    ])
    expect(dataset.memberships.map((m) => [m.clubSourceId, m.games])).toEqual([
      ['Indiana Pacers', 41],
      ['Toronto Raptors', 39],
    ])
  })

  it('makes a club of each team name: a rename is two clubs, a shared name across abbreviations is one', () => {
    const { dataset } = buildDataset([
      { endYear: 2008, totals: [row('durantke01', 'SEA', 80)], teams: new Map([['SEA', team('Seattle SuperSonics')]]) },
      {
        endYear: 2009,
        totals: [row('durantke01', 'OKC', 74)],
        teams: new Map([['OKC', team('Oklahoma City Thunder')]]),
      },
      // Same name, different abbreviation in another era.
      { endYear: 1990, totals: [row('a', 'XXX', 1)], teams: new Map([['XXX', team('Oklahoma City Thunder')]]) },
    ])
    expect(dataset.clubs.map((c) => c.sourceId)).toEqual(['Oklahoma City Thunder', 'Seattle SuperSonics'])
  })

  it('takes nationality from the latest roster that has a valid flag, and reports unknown codes', () => {
    const { dataset, warnings } = buildDataset([
      {
        endYear: 2000,
        totals: [row('p1', 'AAA', 10)],
        teams: new Map([['AAA', team('A', [{ playerId: 'p1', countryCode: 'fr' }])]]),
      },
      {
        endYear: 2001,
        totals: [row('p1', 'BBB', 10)],
        teams: new Map([['BBB', team('B', [{ playerId: 'p1', countryCode: 'zz' }])]]),
      },
    ])
    expect(dataset.players).toEqual([{ sourceId: 'p1', name: 'P1', nationality: 'FR' }])
    expect(warnings).toEqual([{ kind: 'unknown-country-code', detail: '"zz" on 1 roster row(s)' }])
  })

  it('drops seasons after LATEST_SEASON', () => {
    const { dataset } = buildDataset([
      { endYear: lastEndYear() + 1, totals: [row('p1', 'AAA', 10)], teams: new Map([['AAA', team('A')]]) },
    ])
    expect(dataset.memberships).toHaveLength(0)
    expect(dataset.players).toHaveLength(0)
  })

  it('reports a team row whose page is missing and skips it', () => {
    const { dataset, warnings } = buildDataset([{ endYear: 2000, totals: [row('p1', 'AAA', 10)], teams: new Map() }])
    expect(dataset.memberships).toHaveLength(0)
    expect(warnings).toEqual([{ kind: 'missing-team-page', detail: 'AAA 2000' }])
  })

  it('refuses an impossible per-team games count', () => {
    expect(() =>
      buildDataset([
        {
          endYear: 2000,
          totals: [row('p1', 'AAA', 82), row('p1', 'AAA', 29, 'playoffs')],
          teams: new Map([['AAA', team('A')]]),
        },
      ]),
    ).toThrow(/111 games/)
  })
})
