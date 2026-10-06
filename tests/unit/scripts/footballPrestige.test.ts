import { collectContinentalRuns, deriveTitles } from '../../../scripts/football/lib/prestige'
import type { GameResult } from '../../../scripts/football/lib/transfermarktDataset'

const game = (
  competitionId: string,
  season: string,
  home: string,
  away: string,
  extra: Partial<GameResult> = {},
): GameResult => ({
  gameId: `${competitionId}-${season}-${home}-${away}-${extra.date ?? ''}`,
  competitionId,
  season,
  homeClubId: home,
  awayClubId: away,
  round: '',
  date: '2017-01-01',
  homeGoals: null,
  awayGoals: null,
  homePosition: null,
  awayPosition: null,
  ...extra,
})

/** Real, Juve and Barça are in scope; Ajax is not a Big-5 club the game knows. */
const inScope = (clubId: string) => ['real', 'juve', 'barca'].includes(clubId)

describe('collectContinentalRuns', () => {
  const score = (homeGoals: number, awayGoals: number) => ({ homeGoals, awayGoals })

  it('counts each in-scope club’s continental wins per season and competition', () => {
    const runs = collectContinentalRuns(
      [
        game('CL', '2016', 'real', 'juve', score(2, 0)),
        game('CL', '2016', 'juve', 'real', score(1, 3)),
        game('EL', '2016', 'barca', 'ajax', score(1, 0)),
        game('CL', '2017', 'ajax', 'real', score(2, 1)),
      ],
      inScope,
    )
    expect(runs).toEqual([
      { clubId: 'real', season: '2016-2017', wins: { 'Champions League': 2 } },
      { clubId: 'barca', season: '2016-2017', wins: { 'Europa League': 1 } },
    ])
  })

  it('counts a draw for nothing, and a shoot-out win as a win', () => {
    const runs = collectContinentalRuns(
      [
        game('CL', '2016', 'real', 'juve', score(1, 1)),
        game('CL', '2015', 'real', 'barca', { round: 'Final', ...score(6, 4) }),
      ],
      inScope,
    )
    expect(runs).toEqual([{ clubId: 'real', season: '2015-2016', wins: { 'Champions League': 1 } }])
  })

  it('leaves out qualifying rounds, domestic games, unplayed games and seasons outside the data', () => {
    const runs = collectContinentalRuns(
      [
        game('CLQ', '2016', 'real', 'ajax', score(3, 0)),
        game('ES1', '2016', 'real', 'barca', score(3, 0)),
        game('CL', '2011', 'real', 'juve', score(3, 0)),
        game('CL', '2016', 'real', 'juve'),
      ],
      inScope,
    )
    expect(runs).toEqual([])
  })
})

describe('deriveTitles — known titles', () => {
  const known = [{ clubId: 'real', season: '2016-2017', competition: 'Champions League' }]

  it('adds a known title the data does not settle', () => {
    const { titles } = deriveTitles([], inScope, known)
    expect(titles).toEqual(known)
  })

  it('never overrides a final the data holds, and says the entry can go', () => {
    const final = game('CL', '2016', 'juve', 'real', { round: 'Final', homeGoals: 2, awayGoals: 1 })
    const { titles, warnings } = deriveTitles([final], inScope, known)
    expect(titles).toEqual([{ clubId: 'juve', season: '2016-2017', competition: 'Champions League' }])
    expect(warnings).toEqual([{ kind: 'final', detail: expect.stringContaining('drop it from KNOWN_TITLES') }])
  })

  it('ships the 2025-26 European finals and the stopped 2019-20 Ligue 1', () => {
    const { titles } = deriveTitles([], (id) => ['583', '405', '873'].includes(id))
    expect(titles).toEqual(
      expect.arrayContaining([
        { clubId: '583', season: '2025-2026', competition: 'Champions League' },
        { clubId: '405', season: '2025-2026', competition: 'Europa League' },
        { clubId: '873', season: '2025-2026', competition: 'Conference League' },
        { clubId: '583', season: '2019-2020', competition: 'Ligue 1' },
      ]),
    )
  })

  it('fills a league season the derivation refused as unfinished', () => {
    // The real case: Ligue 1 2019-20, stopped before anyone played all their games.
    const stopped = [game('FR1', '2019', 'real', 'barca', { date: '2020-03-08', homePosition: 1, awayPosition: 2 })]
    const { titles, warnings } = deriveTitles(stopped, inScope, [
      { clubId: 'real', season: '2019-2020', competition: 'Ligue 1' },
    ])
    expect(warnings).toEqual([{ kind: 'league', detail: expect.stringContaining('short of') }])
    expect(titles).toEqual([{ clubId: 'real', season: '2019-2020', competition: 'Ligue 1' }])
  })
})

describe('deriveTitles', () => {
  it('crowns the winner of a continental final, shoot-out included', () => {
    // The 2016 final reads 6:4 in the data: the shoot-out is in the score.
    const { titles, warnings } = deriveTitles(
      [game('CL', '2015', 'real', 'atleti', { round: 'Final', homeGoals: 6, awayGoals: 4 })],
      inScope,
    )
    expect(titles).toEqual([{ clubId: 'real', season: '2015-2016', competition: 'Champions League' }])
    expect(warnings).toEqual([])
  })

  it('records no title for an out-of-scope winner', () => {
    const { titles } = deriveTitles(
      [game('EL', '2016', 'ajax', 'juve', { round: 'final', homeGoals: 2, awayGoals: 0 })],
      inScope,
    )
    expect(titles).toEqual([])
  })

  it('refuses to guess a final with no winner in the score', () => {
    const { titles, warnings } = deriveTitles(
      [game('CL', '2016', 'real', 'juve', { round: 'Final', homeGoals: 1, awayGoals: 1 })],
      inScope,
    )
    expect(titles).toEqual([])
    expect(warnings).toEqual([{ kind: 'final', detail: expect.stringContaining('no winner') }])
  })

  /** A 3-club double round-robin: each plays 4 games, the positions after each club's last one. */
  const league = (season: string, lastRound: Partial<Record<string, number>>, drop = false) => {
    const games = [
      game('ES1', season, 'real', 'barca', { date: '2017-01-01' }),
      game('ES1', season, 'barca', 'real', { date: '2017-02-01' }),
      game('ES1', season, 'real', 'juve', { date: '2017-03-01' }),
      game('ES1', season, 'juve', 'real', { date: '2017-04-01', homePosition: 3, awayPosition: lastRound.real }),
      game('ES1', season, 'barca', 'juve', { date: '2017-03-01' }),
      game('ES1', season, 'juve', 'barca', { date: '2017-04-01', homePosition: 3, awayPosition: lastRound.barca }),
    ]
    return drop ? games.slice(0, -1) : games
  }

  it('crowns the club first after its last game of a finished league season', () => {
    const { titles } = deriveTitles(league('2016', { real: 1, barca: 2 }), inScope)
    expect(titles).toEqual([{ clubId: 'real', season: '2016-2017', competition: 'LaLiga' }])
  })

  it('does not crown the leader of a season still being played', () => {
    // The dataset can be built mid-season: its leader is not its champion.
    const { titles, warnings } = deriveTitles(league('2016', { real: 1, barca: 2 }, true), inScope)
    expect(titles).toEqual([])
    expect(warnings).toEqual([{ kind: 'league', detail: expect.stringContaining('short of 4 games') }])
  })

  it('refuses a league season where no single club finishes first', () => {
    const { titles, warnings } = deriveTitles(league('2016', { real: 1, barca: 1 }), inScope)
    expect(titles).toEqual([])
    expect(warnings).toEqual([{ kind: 'league', detail: expect.stringContaining('2 club(s) finish first') }])
  })
})
