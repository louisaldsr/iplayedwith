import {
  upsertMemberships,
  upsertMembershipsBulk,
  deleteMembership,
  listMembershipsBySport,
} from '@/services/membershipsService'
import * as playersRepo from '@/repositories/playersRepository'
import * as clubsRepo from '@/repositories/clubsRepository'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import { PlayerId, ClubId } from '@/domain/ids'
import { NotFoundError, ValidationError } from '@/services/errors'
import { LATEST_SEASON } from '@/domain/season'

jest.mock('@/repositories/playersRepository')
jest.mock('@/repositories/clubsRepository')
jest.mock('@/repositories/membershipsRepository')

const db = {} as never
const mockedPlayersRepo = jest.mocked(playersRepo)
const mockedClubsRepo = jest.mocked(clubsRepo)
const mockedMembershipsRepo = jest.mocked(membershipsRepo)

const player = { id: PlayerId('p1'), name: 'Dupont', sport: 'rugby' as const }
const club = { id: ClubId('c1'), name: 'Toulouse', sport: 'rugby' as const }

afterEach(() => jest.clearAllMocks())

describe('upsertMemberships', () => {
  it('throws NotFoundError when the player does not exist', async () => {
    mockedPlayersRepo.findById.mockResolvedValue(null)

    await expect(upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023' }])).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError on a malformed season, tagged with the row index', async () => {
    mockedPlayersRepo.findById.mockResolvedValue(player)

    await expect(upsertMemberships(db, 'p1', [{ clubId: 'c1', season: 'not-a-season' }])).rejects.toThrow(/row 0/)
  })

  it('throws NotFoundError when a referenced club does not exist', async () => {
    mockedPlayersRepo.findById.mockResolvedValue(player)
    mockedClubsRepo.findManyByIds.mockResolvedValue([])

    await expect(upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023' }])).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError when the club plays a different sport than the player', async () => {
    mockedPlayersRepo.findById.mockResolvedValue(player)
    mockedClubsRepo.findManyByIds.mockResolvedValue([{ ...club, sport: 'football' }])

    await expect(upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023' }])).rejects.toThrow(
      /plays football, but player is rugby/,
    )
  })

  it('upserts when the player and every club match on sport', async () => {
    mockedPlayersRepo.findById.mockResolvedValue(player)
    mockedClubsRepo.findManyByIds.mockResolvedValue([club])
    mockedMembershipsRepo.upsertMany.mockResolvedValue([
      { playerId: player.id, clubId: club.id, season: '2022-2023' as never },
    ])

    const result = await upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023' }])

    expect(mockedMembershipsRepo.upsertMany).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(1)
  })

  describe('games', () => {
    beforeEach(() => {
      mockedPlayersRepo.findById.mockResolvedValue(player)
      mockedClubsRepo.findManyByIds.mockResolvedValue([club])
      mockedMembershipsRepo.upsertMany.mockResolvedValue([])
    })

    const sent = () => mockedMembershipsRepo.upsertMany.mock.calls[0][1][0]

    it('passes a count through', async () => {
      await upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023', games: 26 }])
      expect(sent().games).toBe(26)
    })

    it('keeps 0 and null apart — 0 is "did not play", null is "the source does not say"', async () => {
      await upsertMemberships(db, 'p1', [
        { clubId: 'c1', season: '2022-2023', games: 0 },
        { clubId: 'c1', season: '2021-2022', games: null },
      ])
      const rows = mockedMembershipsRepo.upsertMany.mock.calls[0][1]
      expect(rows.map((r) => r.games)).toEqual([0, null])
    })

    it('leaves games undefined when the writer says nothing, so the stored value is kept', async () => {
      // The admin form knows nothing about games; re-saving a player must not erase them.
      await upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023' }])
      expect(sent().games).toBeUndefined()
    })

    it('rejects a negative or fractional count, tagged with the row index', async () => {
      await expect(upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023', games: -1 }])).rejects.toThrow(
        /row 0: games: must not be negative/,
      )
      await expect(upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023', games: 2.5 }])).rejects.toThrow(
        /whole number/,
      )
      expect(mockedMembershipsRepo.upsertMany).not.toHaveBeenCalled()
    })

    it('rejects a count no season of any sport could hold — a shifted column, not a career', async () => {
      await expect(upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023', games: 1_840 }])).rejects.toThrow(
        /implausible/,
      )
    })

    it('accepts the longest real seasons', async () => {
      // Baseball: 162 regular-season games plus a postseason. The guard is sport-agnostic, so it
      // must sit above every sport's real maximum.
      await expect(
        upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023', games: 180 }]),
      ).resolves.toBeDefined()
    })
  })
})

describe('seasons after LATEST_SEASON', () => {
  const latestStart = Number(LATEST_SEASON.slice(0, 4))
  const nextSeason = `${latestStart + 1}-${latestStart + 2}`

  beforeEach(() => {
    mockedPlayersRepo.findById.mockResolvedValue(player)
    mockedClubsRepo.findManyByIds.mockResolvedValue([club])
    mockedPlayersRepo.listBySport.mockResolvedValue([player])
    mockedClubsRepo.listBySport.mockResolvedValue([club])
    mockedMembershipsRepo.upsertMany.mockResolvedValue([])
  })

  it('are rejected on the single-player path, with the season and the limit in the message', async () => {
    await expect(upsertMemberships(db, 'p1', [{ clubId: 'c1', season: nextSeason }])).rejects.toThrow(
      new RegExp(`row 0: season ${nextSeason} is after the latest season covered \\(${LATEST_SEASON}\\)`),
    )
    expect(mockedMembershipsRepo.upsertMany).not.toHaveBeenCalled()
  })

  it('are rejected on the bulk path before anything is written', async () => {
    await expect(
      upsertMembershipsBulk(db, 'rugby', [
        { playerId: 'p1', clubId: 'c1', season: LATEST_SEASON },
        { playerId: 'p1', clubId: 'c1', season: nextSeason },
      ]),
    ).rejects.toThrow(ValidationError)
    expect(mockedMembershipsRepo.upsertMany).not.toHaveBeenCalled()
  })

  it('leave the latest season itself untouched', async () => {
    await expect(upsertMemberships(db, 'p1', [{ clubId: 'c1', season: LATEST_SEASON }])).resolves.toBeDefined()
  })
})

describe('deleteMembership', () => {
  it('delegates to the repository', async () => {
    await deleteMembership(db, 'p1', 'c1', '2022-2023')
    expect(mockedMembershipsRepo.deleteOne).toHaveBeenCalledWith(db, PlayerId('p1'), ClubId('c1'), '2022-2023')
  })
})

describe('listMembershipsBySport', () => {
  it('delegates to the repository', async () => {
    mockedMembershipsRepo.listBySport.mockResolvedValue([])
    await listMembershipsBySport(db, 'rugby')
    expect(mockedMembershipsRepo.listBySport).toHaveBeenCalledWith(db, 'rugby')
  })
})
