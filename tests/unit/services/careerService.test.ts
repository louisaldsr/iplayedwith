import { getPlayerCareer } from '@/services/careerService'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import * as playersRepo from '@/repositories/playersRepository'
import * as clubsRepo from '@/repositories/clubsRepository'
import { ClubId, PlayerId } from '@/domain/ids'
import { NotFoundError } from '@/services/errors'

jest.mock('@/repositories/membershipsRepository')
jest.mock('@/repositories/playersRepository')
jest.mock('@/repositories/clubsRepository')

const db = {} as never
const player = { id: PlayerId('p-1'), name: 'Alpha Testeur', sport: 'rugby' as const }
const toulouse = { id: ClubId('c-tls'), name: 'Stade Toulousain', sport: 'rugby' as const }

afterEach(() => jest.clearAllMocks())

describe('getPlayerCareer', () => {
  it('resolves the clubs and groups the seasons into stints', async () => {
    jest.mocked(playersRepo.findById).mockResolvedValue(player)
    jest.mocked(membershipsRepo.listCareerRows).mockResolvedValue([
      { clubId: toulouse.id, season: '2015-2016' as never, games: 10 },
      { clubId: toulouse.id, season: '2016-2017' as never, games: 5 },
    ])
    jest.mocked(clubsRepo.findManyByIds).mockResolvedValue([toulouse])

    const career = await getPlayerCareer(db, player.id)

    expect(clubsRepo.findManyByIds).toHaveBeenCalledWith(db, [toulouse.id])
    expect(career).toEqual({
      player,
      stints: [{ club: toulouse, from: '2015-2016', to: '2016-2017', games: 15 }],
    })
  })

  it('skips a membership whose club no longer exists, instead of failing', async () => {
    jest.mocked(playersRepo.findById).mockResolvedValue(player)
    jest
      .mocked(membershipsRepo.listCareerRows)
      .mockResolvedValue([{ clubId: ClubId('c-gone'), season: '2015-2016' as never, games: null }])
    jest.mocked(clubsRepo.findManyByIds).mockResolvedValue([])

    expect((await getPlayerCareer(db, player.id)).stints).toEqual([])
  })

  it('is NotFound for an unknown player', async () => {
    jest.mocked(playersRepo.findById).mockResolvedValue(null)

    await expect(getPlayerCareer(db, PlayerId('nope'))).rejects.toBeInstanceOf(NotFoundError)
  })
})
