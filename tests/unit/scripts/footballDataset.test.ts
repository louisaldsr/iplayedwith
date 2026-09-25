import {
  buildDataset,
  clubLogoUrl,
  createMembershipCollector,
  indexGames,
  seasonFromDatasetYear,
} from '../../../scripts/football/lib/dataset'
import type { Appearance, Club, Game, Player } from '../../../scripts/football/lib/transfermarktDataset'
import { LATEST_SEASON } from '@/domain/season'

const game = (gameId: string, competitionId: string, season: string, homeClubId: string, awayClubId: string): Game => ({
  gameId,
  competitionId,
  season,
  homeClubId,
  awayClubId,
})

const appearance = (playerId: string, playerClubId: string, gameId: string): Appearance => ({
  playerId,
  playerClubId,
  gameId,
})

/**
 * c1/c2 are Premier League clubs, c3/c4 LaLiga clubs, c9/c20 are outside the Big 5.
 * g4 is a pre-2012 game, g2 a domestic cup tie and g3/g8 European ties.
 */
const GAMES: Game[] = [
  game('g1', 'GB1', '2015', 'c1', 'c2'),
  game('g2', 'FAC', '2015', 'c1', 'c9'),
  game('g3', 'CL', '2015', 'c1', 'c20'),
  game('g4', 'GB1', '2011', 'c1', 'c2'),
  game('g5', 'ES1', '2016', 'c3', 'c4'),
  game('g6', 'GB1', '2016', 'c1', 'c2'),
  game('g7', 'GB1', '2015', 'c2', 'c1'),
  game('g8', 'CL', '2015', 'c3', 'c20'),
]

describe('seasonFromDatasetYear', () => {
  it('converts a dataset start year to the domain Season range', () => {
    expect(seasonFromDatasetYear('2012')).toBe('2012-2013')
    expect(seasonFromDatasetYear('2025')).toBe('2025-2026')
  })

  it('rejects seasons before coverage starts', () => {
    expect(seasonFromDatasetYear('2011')).toBeNull()
    expect(seasonFromDatasetYear('2000')).toBeNull()
  })

  it('rejects seasons after the latest season covered, and keeps that season itself', () => {
    const latestStart = Number(LATEST_SEASON.slice(0, 4))
    expect(seasonFromDatasetYear(String(latestStart))).toBe(LATEST_SEASON)
    expect(seasonFromDatasetYear(String(latestStart + 1))).toBeNull()
  })

  it('rejects malformed years', () => {
    expect(seasonFromDatasetYear('')).toBeNull()
    expect(seasonFromDatasetYear('20/21')).toBeNull()
    expect(seasonFromDatasetYear('not-a-year')).toBeNull()
  })
})

describe('indexGames', () => {
  const index = indexGames(GAMES)

  it('scopes clubs to those with a Big-5 league game', () => {
    expect([...index.big5ClubIds].sort()).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('keeps a club in scope on the strength of a pre-2012 league game, but not that game', () => {
    expect(index.big5ClubIds.has('c1')).toBe(true)
    expect(index.seasonByGameId.has('g4')).toBe(false)
  })

  it('labels each club-season with its domestic league', () => {
    expect(index.domesticLeagueByClubSeason.get('c1||2015-2016')).toBe('Premier League')
    expect(index.domesticLeagueByClubSeason.get('c3||2016-2017')).toBe('LaLiga')
  })

  it('has no label for a club-season with no domestic league game', () => {
    expect(index.domesticLeagueByClubSeason.has('c3||2015-2016')).toBe(false)
  })
})

describe('createMembershipCollector', () => {
  const collect = (appearances: Appearance[]) => {
    const collector = createMembershipCollector(indexGames(GAMES))
    appearances.forEach((a) => collector.add(a))
    return collector.result()
  }

  it('folds the appearances of one club-season into a single membership, counting them as games', () => {
    // g1 twice: the source has one row per player per game, so a repeated row is two games.
    const rows = collect([appearance('p1', 'c1', 'g1'), appearance('p1', 'c1', 'g1'), appearance('p1', 'c1', 'g2')])
    expect(rows).toEqual([
      {
        playerTransfermarktId: 'p1',
        clubTransfermarktId: 'c1',
        season: '2015-2016',
        competition: 'Premier League',
        games: 3,
      },
    ])
  })

  it('creates one membership per season at the same club', () => {
    const rows = collect([appearance('p1', 'c1', 'g1'), appearance('p1', 'c1', 'g6')])
    expect(rows.map((r) => r.season)).toEqual(['2015-2016', '2016-2017'])
  })

  it('counts a cup-only appearance as a membership, labelled with the domestic league', () => {
    const rows = collect([appearance('p2', 'c1', 'g2')])
    expect(rows).toEqual([
      {
        playerTransfermarktId: 'p2',
        clubTransfermarktId: 'c1',
        season: '2015-2016',
        competition: 'Premier League',
        games: 1,
      },
    ])
  })

  it('leaves the competition null when the club played no domestic league game that season', () => {
    const rows = collect([appearance('p7', 'c3', 'g8')])
    expect(rows).toEqual([
      { playerTransfermarktId: 'p7', clubTransfermarktId: 'c3', season: '2015-2016', competition: null, games: 1 },
    ])
  })

  it('keeps both clubs for a player who moved mid-season, each with its own games', () => {
    const rows = collect([appearance('p4', 'c2', 'g1'), appearance('p4', 'c2', 'g1'), appearance('p4', 'c1', 'g7')])
    expect(rows.map((r) => [r.clubTransfermarktId, r.season, r.games])).toEqual([
      ['c1', '2015-2016', 1],
      ['c2', '2015-2016', 2],
    ])
  })

  it('counts games separately for each season at the same club', () => {
    const rows = collect([appearance('p1', 'c1', 'g1'), appearance('p1', 'c1', 'g2'), appearance('p1', 'c1', 'g6')])
    expect(rows.map((r) => [r.season, r.games])).toEqual([
      ['2015-2016', 2],
      ['2016-2017', 1],
    ])
  })

  it('ignores appearances for clubs outside the Big-5 scope', () => {
    expect(collect([appearance('p3', 'c9', 'g2'), appearance('p6', 'c20', 'g3')])).toEqual([])
  })

  it('ignores appearances in seasons before coverage starts', () => {
    expect(collect([appearance('p5', 'c1', 'g4')])).toEqual([])
  })

  it('ignores appearances whose game is unknown', () => {
    expect(collect([appearance('p1', 'c1', 'missing-game')])).toEqual([])
  })
})

describe('buildDataset', () => {
  const clubs = new Map<string, Club>([
    ['c1', { clubId: 'c1', name: 'Arsenal FC' }],
    ['c2', { clubId: 'c2', name: 'Chelsea FC' }],
  ])
  const player = (playerId: string, name: string, countryOfCitizenship: string, caps = 0): Player => ({
    playerId,
    name,
    countryOfCitizenship,
    caps,
  })
  const players = new Map<string, Player>([
    ['p1', player('p1', 'Alex Iwobi', 'Nigeria', 77)],
    ['p2', player('p2', 'Yannick Bolasie', 'DR Congo')],
    ['p3', player('p3', 'No Nation', '')],
    ['p4', player('p4', 'Unknown Land', 'Atlantis')],
  ])
  const membership = (playerTransfermarktId: string, clubTransfermarktId: string) => ({
    playerTransfermarktId,
    clubTransfermarktId,
    season: '2015-2016' as never,
    competition: 'Premier League',
    games: 1,
  })

  it('emits only the clubs and players its memberships reference, with crest urls', () => {
    const { dataset } = buildDataset([membership('p1', 'c1')], clubs, players)
    expect(dataset.clubs).toEqual([{ transfermarktId: 'c1', name: 'Arsenal FC', logoUrl: clubLogoUrl('c1') }])
    expect(dataset.players).toEqual([{ transfermarktId: 'p1', name: 'Alex Iwobi', nationality: 'NG', caps: 77 }])
  })

  it('maps Transfermarkt country spellings to alpha-2 codes', () => {
    const { dataset, warnings } = buildDataset([membership('p2', 'c1')], clubs, players)
    expect(dataset.players[0].nationality).toBe('CD')
    expect(warnings).toEqual([])
  })

  it('stores a missing citizenship as null without warning', () => {
    const { dataset, warnings } = buildDataset([membership('p3', 'c1')], clubs, players)
    expect(dataset.players[0].nationality).toBeNull()
    expect(warnings).toEqual([])
  })

  it('warns once per unmapped country and keeps the player', () => {
    const { dataset, warnings } = buildDataset([membership('p4', 'c1'), membership('p4', 'c2')], clubs, players)
    expect(dataset.players[0].nationality).toBeNull()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ kind: 'unmapped-nationality' })
    expect(warnings[0].detail).toContain('Atlantis')
  })

  it('drops memberships whose club or player cannot be resolved, and says so', () => {
    const { dataset, warnings } = buildDataset(
      [membership('p1', 'c1'), membership('p1', 'c-missing'), membership('p-missing', 'c1')],
      clubs,
      players,
    )
    expect(dataset.memberships).toEqual([membership('p1', 'c1')])
    expect(warnings.map((w) => w.kind).sort()).toEqual(['unknown-club', 'unknown-player'])
  })
})
