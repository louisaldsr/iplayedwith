import { listClubs, createClub } from '@/services/clubsService'
import * as clubsRepo from '@/repositories/clubsRepository'
import { ClubId } from '@/domain/ids'
import { ConflictError } from '@/services/errors'

jest.mock('@/repositories/clubsRepository')

const db = {} as never
const mockedRepo = jest.mocked(clubsRepo)

afterEach(() => jest.clearAllMocks())

describe('listClubs', () => {
  it('delegates to the repository with sport and query', async () => {
    const clubs = [{ id: ClubId('c1'), name: 'Toulouse', sport: 'rugby' as const }]
    mockedRepo.listBySport.mockResolvedValue(clubs)

    const result = await listClubs(db, 'rugby', 'toul')

    expect(mockedRepo.listBySport).toHaveBeenCalledWith(db, 'rugby', 'toul')
    expect(result).toBe(clubs)
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
