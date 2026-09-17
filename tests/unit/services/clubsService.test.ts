import { listClubs, createClub } from '@/services/clubsService'
import * as clubsRepo from '@/repositories/clubsRepository'
import { ClubId } from '@/domain/ids'
import { ConflictError } from '@/services/errors'

jest.mock('@/repositories/clubsRepository')

const db = {} as never
const mockedRepo = jest.mocked(clubsRepo)

afterEach(() => jest.clearAllMocks())

describe('listClubs', () => {
  it('searches when given a query, carrying the matched alias through', async () => {
    const clubs = [
      { id: ClubId('c1'), name: 'Stade Rochelais', sport: 'rugby' as const, matchedAlias: 'La Rochelle' },
    ]
    mockedRepo.searchBySport.mockResolvedValue(clubs)

    const result = await listClubs(db, 'rugby', 'la roch')

    expect(mockedRepo.searchBySport).toHaveBeenCalledWith(db, 'rugby', 'la roch')
    expect(mockedRepo.listBySport).not.toHaveBeenCalled()
    expect(result).toBe(clubs)
  })

  // The unbounded path is for seed imports only — the API rejects a query-less request.
  it('falls back to the full club list when no query is given', async () => {
    mockedRepo.listBySport.mockResolvedValue([])

    await listClubs(db, 'rugby')

    expect(mockedRepo.listBySport).toHaveBeenCalledWith(db, 'rugby')
    expect(mockedRepo.searchBySport).not.toHaveBeenCalled()
  })
})

describe('createClub', () => {
  it('inserts a club when no duplicate exists for the sport', async () => {
    mockedRepo.findByNameAndSport.mockResolvedValue(null)
    mockedRepo.insert.mockImplementation(async (_db, club) => club)

    const club = await createClub(db, { name: 'Toulouse', sport: 'rugby' })

    expect(mockedRepo.findByNameAndSport).toHaveBeenCalledWith(db, 'Toulouse', 'rugby')
    expect(club.name).toBe('Toulouse')
    expect(mockedRepo.insert).toHaveBeenCalledTimes(1)
  })

  it('rejects a case-insensitive duplicate name within the same sport', async () => {
    mockedRepo.findByNameAndSport.mockResolvedValue({ id: ClubId('c1'), name: 'Toulouse', sport: 'rugby' })

    await expect(createClub(db, { name: 'toulouse', sport: 'rugby' })).rejects.toThrow(ConflictError)
    expect(mockedRepo.insert).not.toHaveBeenCalled()
  })
})
