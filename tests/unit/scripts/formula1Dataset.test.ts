import {
  buildDataset,
  enwikiTitleOf,
  lastYear,
  REFERENCE_RACES_PER_SEASON,
  scaledWins,
  type ConstructorStandingsPage,
  type JolpicaRace,
  type JolpicaResult,
  type ResultsPage,
} from '../../../scripts/formula1/lib/dataset'
import { LATEST_SEASON } from '@/domain/season'

const driver = (driverId: string, givenName: string, familyName: string, nationality = 'British') => ({
  driverId,
  givenName,
  familyName,
  nationality,
  url: `http://en.wikipedia.org/wiki/${givenName}_${familyName}`,
})

const result = (
  d: ReturnType<typeof driver>,
  constructorId: string,
  position: number,
  status = 'Finished',
): JolpicaResult => ({
  position: String(position),
  positionText: status === 'Withdrew' ? 'W' : String(position),
  laps: status === 'Withdrew' ? '0' : '70',
  status,
  Driver: d,
  Constructor: { constructorId, name: constructorId[0].toUpperCase() + constructorId.slice(1) },
})

const race = (season: number, round: number, results: JolpicaResult[], circuitId = 'silverstone'): JolpicaRace => ({
  season: String(season),
  round: String(round),
  raceName: `Race ${round}`,
  Circuit: { circuitId },
  Results: results,
})

const page = (races: JolpicaRace[]): ResultsPage => ({
  MRData: { total: String(races.reduce((n, r) => n + r.Results.length, 0)), RaceTable: { Races: races } },
})

const standings = (season: number, champion: string): ConstructorStandingsPage => ({
  MRData: {
    StandingsTable: {
      StandingsLists: [
        {
          season: String(season),
          ConstructorStandings: [{ position: '1', Constructor: { constructorId: champion, name: champion } }],
        },
      ],
    },
  },
})

const hill = driver('hill', 'Graham', 'Hill')
const clark = driver('clark', 'Jim', 'Clark')
const parnelli = driver('jones', 'Parnelli', 'Jones', 'American')
const rindt = driver('rindt', 'Jochen', 'Rindt', 'Austrian')

describe('buildDataset', () => {
  // 1960: two Grands Prix plus the Indianapolis 500. Round 2 spans two result pages.
  const { dataset, warnings } = buildDataset([
    {
      year: 1960,
      results: [
        page([
          race(1960, 1, [result(hill, 'brm', 1), result(clark, 'lotus', 2), result(rindt, 'lotus', 3, 'Withdrew')]),
          race(1960, 2, [result(clark, 'lotus', 1)]),
        ]),
        page([
          race(1960, 2, [result(hill, 'lotus', 2), result(rindt, 'lotus', 4)]),
          race(1960, 3, [result(parnelli, 'watson', 1)], 'indianapolis'),
        ]),
      ],
      standings: standings(1960, 'lotus'),
    },
  ])

  it('makes the year a calendar season', () => {
    expect(new Set(dataset.memberships.map((m) => m.season))).toEqual(new Set(['1960']))
  })

  it('drops the Indianapolis 500: its drivers and constructors are not Formula 1', () => {
    expect(dataset.players.map((p) => p.sourceId)).not.toContain('jones')
    expect(dataset.clubs.map((c) => c.sourceId)).not.toContain('watson')
  })

  it('gives a driver one membership per constructor he raced for that year, with his starts', () => {
    const hillRows = dataset.memberships.filter((m) => m.playerSourceId === 'hill')
    expect(hillRows.map((m) => [m.clubSourceId, m.starts, m.games]).sort()).toEqual([
      ['brm', 1, 1],
      ['lotus', 1, 1],
    ])
  })

  it('keeps a driver who withdrew on the team, without counting it as a start', () => {
    const rindtLotus = dataset.memberships.find((m) => m.playerSourceId === 'rindt')
    expect(rindtLotus).toMatchObject({ clubSourceId: 'lotus', starts: 1, games: 1 })
  })

  it('counts a 1950s handover as a start: a "Withdrew" row with laps done', () => {
    const handedOver = {
      ...result(driver('fagioli', 'Luigi', 'Fagioli', 'Italian'), 'alfa', 9, 'Withdrew'),
      laps: '20',
    }
    const { dataset: d } = buildDataset([
      { year: 1951, results: [page([race(1951, 1, [handedOver])])], standings: null },
    ])
    expect(d.memberships[0]).toMatchObject({ starts: 1, games: 1 })
  })

  it('merges a race spread over two pages before counting', () => {
    const clarkLotus = dataset.memberships.find((m) => m.playerSourceId === 'clark')
    expect(clarkLotus?.starts).toBe(2)
  })

  it('scales podiums to a reference season, so a short calendar counts as much as a long one', () => {
    const scale = REFERENCE_RACES_PER_SEASON / 2 // two Grands Prix that year, Indianapolis aside
    const podiums = Object.fromEntries(dataset.players.map((p) => [p.sourceId, p.podiumsScaled]))
    // Rindt's withdrawal is numbered 3rd by `position`, but it is no podium.
    expect(podiums).toEqual({ hill: 2 * scale, clark: 2 * scale, rindt: 0 })
  })

  it('records each constructor-season with a win, and the constructors’ champion', () => {
    expect(dataset.constructorSeasons).toEqual(
      expect.arrayContaining([
        { clubSourceId: 'brm', season: '1960', wins: 1, races: 2, champion: false },
        { clubSourceId: 'lotus', season: '1960', wins: 1, races: 2, champion: true },
      ]),
    )
    expect(dataset.constructorSeasons).toHaveLength(2)
    // One win in a two-race season weighs like ten in twenty.
    expect(scaledWins(dataset.constructorSeasons[0])).toBe(10)
  })

  it('maps the demonyms to flags, and keeps the Wikipedia title', () => {
    const rindtRow = dataset.players.find((p) => p.sourceId === 'rindt')
    expect(rindtRow).toMatchObject({ name: 'Jochen Rindt', nationality: 'AT', enwikiTitle: 'Jochen Rindt' })
    expect(dataset.players.find((p) => p.sourceId === 'hill')?.nationality).toBe('GB')
    expect(warnings).toEqual([])
  })

  it('warns about a demonym it cannot map, and leaves that driver without a flag', () => {
    const { dataset: d, warnings: w } = buildDataset([
      {
        year: 1999,
        results: [page([race(1999, 1, [result(driver('x', 'X', 'Y', 'Atlantean'), 'tyrrell', 1)])])],
        standings: null,
      },
    ])
    expect(d.players[0].nationality).toBeNull()
    expect(w).toEqual([{ kind: 'unknown-nationality', detail: '"Atlantean" (1 driver(s))' }])
  })
})

describe('enwikiTitleOf', () => {
  it('decodes the article title of an English Wikipedia URL', () => {
    expect(enwikiTitleOf('http://en.wikipedia.org/wiki/Kimi_R%C3%A4ikk%C3%B6nen')).toBe('Kimi Räikkönen')
    expect(enwikiTitleOf('https://en.wikipedia.org/wiki/Nino_Farina')).toBe('Nino Farina')
  })

  it('reads nothing else', () => {
    expect(enwikiTitleOf(undefined)).toBeNull()
    expect(enwikiTitleOf('https://de.wikipedia.org/wiki/Nino_Farina')).toBeNull()
  })
})

describe('lastYear', () => {
  it('is the calendar year LATEST_SEASON starts in — the season still being raced is left out', () => {
    expect(lastYear()).toBe(Number(LATEST_SEASON.slice(0, 4)))
  })
})
