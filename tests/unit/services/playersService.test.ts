import { listPlayers, createPlayer } from '@/services/playersService'
import * as playersRepo from '@/repositories/playersRepository'
import { PlayerId } from '@/domain/ids'

jest.mock('@/repositories/playersRepository')

const db = {} as never
const mockedRepo = jest.mocked(playersRepo)

afterEach(() => jest.clearAllMocks())

describe('listPlayers', () => {
  it('searches when given a query', async () => {
    const players = [{ id: PlayerId('p1'), name: 'Dupont', sport: 'rugby' as const }]
    mockedRepo.searchBySport.mockResolvedValue(players)

    const result = await listPlayers(db, 'rugby', 'dup')

    expect(mockedRepo.searchBySport).toHaveBeenCalledWith(db, 'rugby', 'dup')
    expect(mockedRepo.listBySport).not.toHaveBeenCalled()
    expect(result).toBe(players)
  })

  // The unbounded path is for seed imports only — the API rejects a query-less request.
  it('falls back to the full roster when no query is given', async () => {
    mockedRepo.listBySport.mockResolvedValue([])

    await listPlayers(db, 'rugby')

    expect(mockedRepo.listBySport).toHaveBeenCalledWith(db, 'rugby')
    expect(mockedRepo.searchBySport).not.toHaveBeenCalled()
  })
})

describe('createPlayer', () => {
  it('inserts a player with a generated id, no duplicate-name check', async () => {
    mockedRepo.insert.mockImplementation(async (_db, player) => player)

    const player = await createPlayer(db, { name: 'Dupont', sport: 'rugby' })

    expect(player.name).toBe('Dupont')
    expect(player.sport).toBe('rugby')
    expect(player.nationality).toBeUndefined()
    expect(typeof player.id).toBe('string')
    expect(mockedRepo.insert).toHaveBeenCalledTimes(1)
  })

  it('inserts a player with a valid nationality', async () => {
    mockedRepo.insert.mockImplementation(async (_db, player) => player)

    const player = await createPlayer(db, { name: 'Dupont', sport: 'rugby', nationality: 'fr' })

    expect(player.nationality).toBe('FR')
  })

  it('throws on an invalid nationality code', async () => {
    await expect(createPlayer(db, { name: 'Dupont', sport: 'rugby', nationality: 'ZZ' })).rejects.toThrow(
      'Invalid nationality code: ZZ',
    )
    expect(mockedRepo.insert).not.toHaveBeenCalled()
  })
})
