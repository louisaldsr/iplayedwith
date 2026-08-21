import { validateConnection } from '@/services/validateService'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import { PlayerId, ClubId } from '@/domain/ids'

jest.mock('@/repositories/membershipsRepository')

const db = {} as never
const mockedRepo = jest.mocked(membershipsRepo)

afterEach(() => jest.clearAllMocks())

describe('validateConnection — hard mode (clubId + season given)', () => {
  it('is valid when both players have the exact membership', async () => {
    mockedRepo.hasExactForAny.mockResolvedValue([PlayerId('a'), PlayerId('b')])

    const result = await validateConnection(db, { playerAId: 'a', playerBId: 'b', clubId: 'c1', season: '2022-2023' })

    expect(mockedRepo.hasExactForAny).toHaveBeenCalledWith(db, [PlayerId('a'), PlayerId('b')], ClubId('c1'), '2022-2023')
    expect(result).toEqual({ valid: true, membership: { clubId: 'c1', season: '2022-2023' } })
  })

  it('is invalid when only one player has the exact membership', async () => {
    mockedRepo.hasExactForAny.mockResolvedValue([PlayerId('a')])

    const result = await validateConnection(db, { playerAId: 'a', playerBId: 'b', clubId: 'c1', season: '2022-2023' })

    expect(result).toEqual({ valid: false, membership: null })
  })
})

describe('validateConnection — easy mode (no clubId/season)', () => {
  it('finds the first shared club+season between the two players', async () => {
    mockedRepo.listByPlayer.mockImplementation(async (_db, playerId) =>
      playerId === PlayerId('a')
        ? [{ clubId: ClubId('c1'), season: '2022-2023' as never }]
        : [{ clubId: ClubId('c1'), season: '2022-2023' as never }, { clubId: ClubId('c2'), season: '2021-2022' as never }],
    )

    const result = await validateConnection(db, { playerAId: 'a', playerBId: 'b' })

    expect(result).toEqual({ valid: true, membership: { clubId: 'c1', season: '2022-2023' } })
  })

  it('is invalid when the two players share no club+season', async () => {
    mockedRepo.listByPlayer.mockImplementation(async (_db, playerId) =>
      playerId === PlayerId('a')
        ? [{ clubId: ClubId('c1'), season: '2022-2023' as never }]
        : [{ clubId: ClubId('c2'), season: '2021-2022' as never }],
    )

    const result = await validateConnection(db, { playerAId: 'a', playerBId: 'b' })

    expect(result).toEqual({ valid: false, membership: null })
  })
})
