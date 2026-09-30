import { getDailyRanking, recordDailyHint, recordDailyMove, startDailyResult } from '@/services/dailyResultService'
import * as dailyResultsRepo from '@/repositories/dailyResultsRepository'
import * as visitorsRepo from '@/repositories/visitorsRepository'
import { NAME_ADJECTIVES, NAME_NOUNS } from '@/domain/visitorName'
import { ChallengeDay, DAILY_LIVES } from '@/domain/dailyChallenge'
import { VisitorId } from '@/domain/dailyResult'
import { PlayerId } from '@/domain/ids'
import { ConflictError } from '@/services/errors'
import { MoveResult } from '@/services/moveService'

jest.mock('@/repositories/dailyResultsRepository')
jest.mock('@/repositories/visitorsRepository')

const db = {} as never
const repo = jest.mocked(dailyResultsRepo)
const visitors = jest.mocked(visitorsRepo)
const visitorId = '6f1c2b1e-8a5d-4c1b-9d3e-2f7a1b0c9e11' as VisitorId
// 00:30 in Paris on the 16th, still the 15th in UTC.
const now = new Date('2026-07-15T22:30:00Z')
const move = { visitorId, playerAId: 'p-a', playerBId: 'p-b' }

const accepted = (victory: boolean): MoveResult => ({
  ok: true,
  node: { kind: 'player', player: { id: PlayerId('p-c'), name: 'C', sport: 'rugby' } },
  edges: [],
  clubs: [],
  victory,
  path: victory ? [PlayerId('p-a'), PlayerId('p-c'), PlayerId('p-b')] : [],
})

beforeEach(() => visitors.ensure.mockResolvedValue({ adjective: 'hasty', noun: 'prop', number: 42 }))

afterEach(() => {
  jest.clearAllMocks()
  jest.restoreAllMocks()
})

describe('startDailyResult', () => {
  it("stamps the start of today's challenge — the Paris day", async () => {
    await startDailyResult(db, 'rugby', ChallengeDay('2026-07-16'), visitorId, now)
    expect(repo.start).toHaveBeenCalledWith(db, 'rugby', '2026-07-16', visitorId)
  })

  it('gives the visitor a generated name on the way', async () => {
    await startDailyResult(db, 'rugby', ChallengeDay('2026-07-16'), visitorId, now)
    const [, id, name] = visitors.ensure.mock.calls[0]
    expect(id).toBe(visitorId)
    expect(NAME_ADJECTIVES).toContain(name.adjective)
    expect(NAME_NOUNS).toContain(name.noun)
  })

  it('still starts when the name cannot be created — the result matters more', async () => {
    visitors.ensure.mockRejectedValue(new Error('function ensure_visitor does not exist'))
    jest.spyOn(console, 'error').mockImplementation(() => {})

    await startDailyResult(db, 'rugby', ChallengeDay('2026-07-16'), visitorId, now)

    expect(repo.start).toHaveBeenCalled()
  })

  it('refuses a day that is no longer today — a page left open past midnight', async () => {
    await expect(startDailyResult(db, 'rugby', ChallengeDay('2026-07-15'), visitorId, now)).rejects.toThrow(
      ConflictError,
    )
    expect(repo.start).not.toHaveBeenCalled()
  })
})

describe('recordDailyMove', () => {
  it('counts an accepted move as an attempt, on the Paris day', async () => {
    await recordDailyMove(db, 'rugby', move, accepted(false), now)
    expect(repo.recordMove).toHaveBeenCalledWith(db, {
      sport: 'rugby',
      day: '2026-07-16',
      ...move,
      costsLife: false,
      links: null,
      maxLives: DAILY_LIVES,
    })
  })

  it('records the winning chain length', async () => {
    await recordDailyMove(db, 'rugby', move, accepted(true), now)
    expect(repo.recordMove).toHaveBeenCalledWith(db, expect.objectContaining({ costsLife: false, links: 2 }))
  })

  it('counts a guess linked to nobody as an attempt that costs a life', async () => {
    await recordDailyMove(db, 'rugby', move, { ok: false, code: 'not-connected', reason: '' }, now)
    expect(repo.recordMove).toHaveBeenCalledWith(db, expect.objectContaining({ costsLife: true, links: null }))
  })

  it.each(['already-on-board', 'wrong-kind', 'game-over'] as const)('does not count a %s refusal', async (code) => {
    await recordDailyMove(db, 'rugby', move, { ok: false, code, reason: '' }, now)
    expect(repo.recordMove).not.toHaveBeenCalled()
  })
})

describe('recordDailyHint', () => {
  it("records a career opened during today's challenge", async () => {
    await recordDailyHint(db, 'rugby', ChallengeDay('2026-07-16'), visitorId, 'p-c', now)
    expect(repo.recordHint).toHaveBeenCalledWith(db, 'rugby', '2026-07-16', visitorId, 'p-c')
  })

  it('refuses a day that is no longer today', async () => {
    await expect(recordDailyHint(db, 'rugby', ChallengeDay('2026-07-15'), visitorId, 'p-c', now)).rejects.toThrow(
      ConflictError,
    )
    expect(repo.recordHint).not.toHaveBeenCalled()
  })
})

describe('getDailyRanking', () => {
  it("reads the day's ranking as the database orders it", async () => {
    const entry = {
      rank: 1,
      visitorId,
      name: { adjective: 'hasty' as const, noun: 'prop' as const, number: 42 },
      attempts: 2,
      durationMs: 61_000,
      livesLost: 0,
      links: 2,
      hints: 1,
      finishedAt: '2026-07-16T08:00:00Z',
    }
    repo.ranking.mockResolvedValue([entry])
    await expect(getDailyRanking(db, 'rugby', ChallengeDay('2026-07-16'))).resolves.toEqual([entry])
  })
})
