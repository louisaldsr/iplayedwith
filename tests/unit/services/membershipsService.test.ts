import { upsertMemberships, deleteMembership, listMembershipsBySport } from '@/services/membershipsService'
import * as playersRepo from '@/repositories/playersRepository'
import * as clubsRepo from '@/repositories/clubsRepository'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import { PlayerId, ClubId } from '@/domain/ids'
import { NotFoundError, ValidationError } from '@/services/errors'

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

    await expect(
      upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023' }]),
    ).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError on a malformed season, tagged with the row index', async () => {
    mockedPlayersRepo.findById.mockResolvedValue(player)

    await expect(
      upsertMemberships(db, 'p1', [{ clubId: 'c1', season: 'not-a-season' }]),
    ).rejects.toThrow(/row 0/)
  })

  it('throws NotFoundError when a referenced club does not exist', async () => {
    mockedPlayersRepo.findById.mockResolvedValue(player)
    mockedClubsRepo.findManyByIds.mockResolvedValue([])

    await expect(
      upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023' }]),
    ).rejects.toThrow(NotFoundError)
  })

  it('throws ValidationError when the club plays a different sport than the player', async () => {
    mockedPlayersRepo.findById.mockResolvedValue(player)
    mockedClubsRepo.findManyByIds.mockResolvedValue([{ ...club, sport: 'football' }])

    await expect(
      upsertMemberships(db, 'p1', [{ clubId: 'c1', season: '2022-2023' }]),
    ).rejects.toThrow(/plays football, but player is rugby/)
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
