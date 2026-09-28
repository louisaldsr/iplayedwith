import { getDailyChallenge } from '@/services/dailyChallengeService'
import * as dailyChallengesRepo from '@/repositories/dailyChallengesRepository'
import * as playersRepo from '@/repositories/playersRepository'
import { PlayerId } from '@/domain/ids'
import { ChallengeDay } from '@/domain/dailyChallenge'
import { NotFoundError } from '@/services/errors'

jest.mock('@/repositories/dailyChallengesRepository')
jest.mock('@/repositories/playersRepository')

const db = {} as never
const mockedChallenges = jest.mocked(dailyChallengesRepo)
const mockedPlayers = jest.mocked(playersRepo)

const dupont = { id: PlayerId('p-dupont'), name: 'Antoine Dupont', sport: 'rugby' as const }
const ntamack = { id: PlayerId('p-ntamack'), name: 'Romain Ntamack', sport: 'rugby' as const }

beforeEach(() => {
  mockedChallenges.getOrGenerate.mockResolvedValue({
    sport: 'rugby',
    day: ChallengeDay('2026-07-15'),
    number: 12,
    playerAId: dupont.id,
    playerBId: ntamack.id,
    optimalLinks: 3,
  })
})

afterEach(() => jest.clearAllMocks())

describe('getDailyChallenge', () => {
  it('asks for the Paris day, not the UTC one', async () => {
    mockedPlayers.findManyByIds.mockResolvedValue([dupont, ntamack])

    await getDailyChallenge(db, 'rugby', new Date('2026-07-14T22:30:00Z'))

    expect(mockedChallenges.getOrGenerate).toHaveBeenCalledWith(db, 'rugby', '2026-07-15')
  })

  it('resolves both players, in A/B order whatever order the repository returns them in', async () => {
    mockedPlayers.findManyByIds.mockResolvedValue([ntamack, dupont])

    const challenge = await getDailyChallenge(db, 'rugby', new Date('2026-07-15T10:00:00Z'))

    expect(challenge).toEqual({
      sport: 'rugby',
      day: '2026-07-15',
      number: 12,
      playerA: dupont,
      playerB: ntamack,
      optimalLinks: 3,
    })
  })

  it('exposes no solution', async () => {
    mockedPlayers.findManyByIds.mockResolvedValue([dupont, ntamack])

    const challenge = await getDailyChallenge(db, 'rugby')

    expect(Object.keys(challenge).sort()).toEqual(['day', 'number', 'optimalLinks', 'playerA', 'playerB', 'sport'])
  })

  it('is NotFound when a player of the stored pair is gone', async () => {
    mockedPlayers.findManyByIds.mockResolvedValue([dupont])

    await expect(getDailyChallenge(db, 'rugby')).rejects.toBeInstanceOf(NotFoundError)
  })
})
