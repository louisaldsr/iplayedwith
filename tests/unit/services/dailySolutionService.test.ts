import { getDailySolution } from '@/services/dailySolutionService'
import * as dailyChallengesRepo from '@/repositories/dailyChallengesRepository'
import * as dailyResultsRepo from '@/repositories/dailyResultsRepository'
import * as playersRepo from '@/repositories/playersRepository'
import * as clubsRepo from '@/repositories/clubsRepository'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import { ChallengeDay } from '@/domain/dailyChallenge'
import { VisitorId } from '@/domain/dailyResult'
import { ClubId, PlayerId } from '@/domain/ids'
import { Season } from '@/domain/season'
import { ForbiddenError, NotFoundError } from '@/services/errors'

jest.mock('@/repositories/dailyChallengesRepository')
jest.mock('@/repositories/dailyResultsRepository')
jest.mock('@/repositories/playersRepository')
jest.mock('@/repositories/clubsRepository')
jest.mock('@/repositories/membershipsRepository')

const db = {} as never
const day = ChallengeDay('2026-10-06')
const visitorId = '6f1c2b1e-8a5d-4c1b-9d3e-2f7a1b0c9e11' as VisitorId
const challenges = jest.mocked(dailyChallengesRepo)
const results = jest.mocked(dailyResultsRepo)

const player = (id: string, name: string) => ({ id: PlayerId(id), name, sport: 'rugby' as const })
const a = player('p-a', 'Alpha')
const x = player('p-x', 'Xavier')
const b = player('p-b', 'Bravo')
const club = { id: ClubId('c-1'), name: 'Club Un', sport: 'rugby' as const }

beforeEach(() => {
  results.findOutcome.mockResolvedValue('lost')
  challenges.findSolution.mockResolvedValue([a.id, x.id, b.id])
  // Out of order, as a database may return them.
  jest.mocked(playersRepo.findManyByIds).mockResolvedValue([b, a, x])
  jest
    .mocked(membershipsRepo.listForPlayers)
    .mockResolvedValue([a, x, b].map((p) => ({ playerId: p.id, clubId: club.id, season: '2019-2020' as Season })))
  jest.mocked(clubsRepo.findManyByIds).mockResolvedValue([club])
})

afterEach(() => jest.clearAllMocks())

describe('getDailySolution', () => {
  it.each(['won', 'lost'] as const)('reveals the chain, A to B, once the day is %s', async (outcome) => {
    results.findOutcome.mockResolvedValue(outcome)
    await expect(getDailySolution(db, 'rugby', day, visitorId)).resolves.toEqual({
      players: [a, x, b],
      links: [
        { club, season: '2019-2020' },
        { club, season: '2019-2020' },
      ],
    })
    expect(results.findOutcome).toHaveBeenCalledWith(db, 'rugby', day, visitorId)
  })

  it('refuses while the day is not over — it would give the answer away', async () => {
    results.findOutcome.mockResolvedValue(null)
    await expect(getDailySolution(db, 'rugby', day, visitorId)).rejects.toThrow(ForbiddenError)
    expect(challenges.findSolution).not.toHaveBeenCalled()
  })

  it('is not found for a day without a challenge', async () => {
    challenges.findSolution.mockResolvedValue(null)
    await expect(getDailySolution(db, 'rugby', day, visitorId)).rejects.toThrow(NotFoundError)
  })

  it('fails loudly when the chain no longer holds', async () => {
    jest.mocked(membershipsRepo.listForPlayers).mockResolvedValue([])
    await expect(getDailySolution(db, 'rugby', day, visitorId)).rejects.toThrow('no longer holds')
  })
})
