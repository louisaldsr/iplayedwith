/**
 * @jest-environment node
 *
 * Not jsdom: under a browser environment Jest resolves cheerio to its ESM browser build and
 * cannot parse it (same as rugbyCareerStats.test.ts).
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildDataset, firstEndYear, lastEndYear, seasonFromEndYear } from '../../../scripts/basketball/lib/dataset'
import { parsePlayoffs, parseTeamPage, type TeamSeasonPage } from '../../../scripts/basketball/lib/rosterParser'
import {
  capsByNation,
  parseFibaPlayerPage,
  parseFibaRanking,
  UNKNOWN_NATION,
  type FibaRankedNation,
} from '../../../scripts/basketball/lib/fiba'
import { parseTotalsPage, type TotalsRow } from '../../../scripts/basketball/lib/totalsParser'
import { LATEST_SEASON } from '@/domain/season'

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, '../../fixtures/basketball', name), 'utf8')

describe('parseTotalsPage', () => {
  const rows = parseTotalsPage(fixture('totals.html'))

  it('keeps one row per (player, team, phase) and drops the 2TM aggregate and league-average rows', () => {
    expect(rows.filter((r) => r.playerId === 'siakapa01')).toEqual([
      {
        playerId: 'siakapa01',
        name: 'Pascal Siakam',
        teamAbbr: 'TOR',
        phase: 'regular',
        games: 39,
        starts: 39,
        minutes: 1300,
      },
      {
        playerId: 'siakapa01',
        name: 'Pascal Siakam',
        teamAbbr: 'IND',
        phase: 'regular',
        games: 41,
        starts: 41,
        minutes: 1350,
      },
      {
        playerId: 'siakapa01',
        name: 'Pascal Siakam',
        teamAbbr: 'IND',
        phase: 'playoffs',
        games: 17,
        starts: 17,
        minutes: 600,
      },
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

  it('reads a blank games-started cell as unknown, not 0', () => {
    expect(rows.find((r) => r.playerId === 'jordami01')).toMatchObject({ starts: null, minutes: 3000 })
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

  it('sums the playoff wins of every series and spots the title', () => {
    expect([team.playoffWins, team.champion]).toEqual([15, true])
  })

  it("counts the wins of a lost series too — the team's own wins come first", () => {
    expect(
      parsePlayoffs(
        'Won NBA Western Conference First Round (2-1) versus Portland Trail Blazers ' +
          'Lost NBA Western Conference Finals (1-4) versus Los Angeles Lakers',
      ),
    ).toEqual({ playoffWins: 3, champion: false })
    expect(parsePlayoffs('')).toEqual({ playoffWins: 0, champion: false })
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
  const team = (
    name: string,
    roster: TeamSeasonPage['roster'] = [],
    playoffs: Partial<Pick<TeamSeasonPage, 'playoffWins' | 'champion'>> = {},
  ): TeamSeasonPage => ({
    name,
    logoUrl: `https://logo/${name}.png`,
    roster,
    playoffWins: 0,
    champion: false,
    ...playoffs,
  })
  const row = (
    playerId: string,
    teamAbbr: string,
    games: number,
    phase: TotalsRow['phase'] = 'regular',
    starts: number | null = games,
  ): TotalsRow => ({
    playerId,
    name: playerId.toUpperCase(),
    teamAbbr,
    phase,
    games,
    starts,
    minutes: games * 30,
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
        starts: 99,
        minutes: 2970,
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
    expect(dataset.players).toEqual([{ sourceId: 'p1', name: 'P1', nationality: 'FR', capsByNation: null }])
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

  it("drops a whole squad's starts when one member's are unknown, and keeps its minutes", () => {
    const { dataset } = buildDataset([
      {
        endYear: 1981,
        totals: [row('a', 'BOS', 80), row('b', 'BOS', 70, 'regular', null), row('c', 'LAL', 60)],
        teams: new Map([
          ['BOS', team('Boston Celtics')],
          ['LAL', team('Los Angeles Lakers')],
        ]),
      },
    ])
    expect(dataset.memberships.map((m) => [m.playerSourceId, m.starts, m.minutes])).toEqual([
      ['a', null, 2400],
      ['b', null, 2100],
      ['c', 60, 1800],
    ])
  })

  it('keeps the playoff run of every team that reached them, title included', () => {
    const { dataset } = buildDataset([
      {
        endYear: 1986,
        totals: [row('a', 'BOS', 80), row('b', 'NYK', 80)],
        teams: new Map([
          ['BOS', team('Boston Celtics', [], { playoffWins: 15, champion: true })],
          ['NYK', team('New York Knicks')],
        ]),
      },
    ])
    expect(dataset.clubSeasons).toEqual([
      { clubSourceId: 'Boston Celtics', season: '1985-1986', playoffWins: 15, champion: true },
    ])
  })

  it('reads caps from FIBA pages: unknown without one, the nation coded through the ranking', () => {
    const { dataset } = buildDataset(
      [
        {
          endYear: 2010,
          totals: [row('parketo01', 'SAS', 80), row('x', 'SAS', 80)],
          teams: new Map([['SAS', team('San Antonio Spurs')]]),
        },
      ],
      new Map([['parketo01', [parseFibaPlayerPage(fixture('fiba-player.html'))]]]),
      [{ fibaCode: 'FRA', countryName: 'France', worldRank: 3 }],
    )
    expect(dataset.players.map((p) => [p.sourceId, p.capsByNation])).toEqual([
      ['parketo01', { FRA: 25 }],
      ['x', null],
    ])
  })
})

describe('FIBA', () => {
  const page = parseFibaPlayerPage(fixture('fiba-player.html'))
  const ranking: FibaRankedNation[] = [{ fibaCode: 'FRA', countryName: 'France', worldRank: 3 }]

  it('reads the senior table only, the title country and the nationality field', () => {
    expect(page).toEqual({
      titleCountry: 'France',
      nationalityCodes: ['BEL', 'FRA', 'USA'],
      seniorEvents: [
        { year: 2016, event: 'Olympic Games: Tournament for Men', games: 5 },
        { year: 2015, event: 'EuroBasket', games: 9 },
        { year: 2013, event: 'EuroBasket', games: 11 },
      ],
    })
  })

  it('counts an event listed on two duplicate FIBA pages once', () => {
    expect(capsByNation([page, page], ranking)).toEqual({ FRA: 25 })
  })

  it('falls back on a single nationality code, and on "unknown" for a dual national with no title country', () => {
    const noTitle = { ...page, titleCountry: null }
    expect(capsByNation([{ ...noTitle, nationalityCodes: ['USA'] }], ranking)).toEqual({ USA: 25 })
    expect(capsByNation([noTitle], ranking)).toEqual({ [UNKNOWN_NATION]: 25 })
  })

  it('gives no caps entry at all to a player with no senior game', () => {
    expect(capsByNation([{ ...page, seniorEvents: [] }], ranking)).toEqual({})
  })

  it('reads the ranked nations from the payload the ranking page embeds', () => {
    // The page escapes its payload's quotes (\\"), as the real one does; 120 nations, codes AAA, AAB…
    const code = (i: number) => `A${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`
    const name = (i: number) => (i === 8 ? 'T\\u00fcrkiye' : `Nation ${i}`)
    const html = Array.from(
      { length: 120 },
      (_, i) =>
        `{\\"worldRank\\":${i + 1},\\"countryName\\":\\"${name(i)}\\",\\"zoneRank\\":1,` +
        `\\"iocCode\\":\\"${code(i)}\\",\\"fibaCode\\":\\"${code(i)}\\",\\"currentPoints\\":1}`,
    ).join(',')

    const nations = parseFibaRanking(html)
    expect(nations).toHaveLength(120)
    expect(nations[8]).toEqual({ fibaCode: 'AAI', countryName: 'Türkiye', worldRank: 9 })
  })
})
