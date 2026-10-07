import {
  getDailyLeaderboard,
  getDailyRanking,
  getDailyStats,
  recordDailyHint,
  recordDailyMove,
  startDailyResult,
} from '@/services/dailyResultService'
import * as dailyResultsRepo from '@/repositories/dailyResultsRepository'
import * as visitorsRepo from '@/repositories/visitorsRepository'
import { generatedNameOf } from '@/domain/visitorName'
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

beforeEach(() => visitors.ensure.mockResolvedValue('hasty:prop:042'))

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
    const [, id, username] = visitors.ensure.mock.calls[0]
    expect(id).toBe(visitorId)
    expect(generatedNameOf(username)).not.toBeNull()
  })

  it('still starts when the name cannot be created — the result matters more', async () => {
    visitors.ensure.mockRejectedValue(new Error('function ensure_visitor does not exist'))
    jest.spyOn(console, 'error').mockImplementation(() => {})

    await startDailyResult(db, 'rugby', ChallengeDay('2026-07-16'), visitorId, now)

    expect(repo.start).toHaveBeenCalled()
  })

  it('stamps the start of a past day — played late, from the archive', async () => {
    await startDailyResult(db, 'rugby', ChallengeDay('2026-07-02'), visitorId, now)
    expect(repo.start).toHaveBeenCalledWith(db, 'rugby', '2026-07-02', visitorId)
  })

  it("refuses a future day — tomorrow's pair is drawn, and hidden", async () => {
    await expect(startDailyResult(db, 'rugby', ChallengeDay('2026-07-17'), visitorId, now)).rejects.toThrow(
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
      path: null,
      maxLives: DAILY_LIVES,
    })
  })

  it('records the winning chain — its length and its players, A to B', async () => {
    await recordDailyMove(db, 'rugby', move, accepted(true), now)
    expect(repo.recordMove).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ costsLife: false, links: 2, path: ['p-a', 'p-c', 'p-b'] }),
    )
  })

  it('counts a guess linked to nobody as an attempt that costs a life', async () => {
    await recordDailyMove(db, 'rugby', move, { ok: false, code: 'not-connected', reason: '' }, now)
    expect(repo.recordMove).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ costsLife: true, links: null, path: null }),
    )
  })

  it('counts the move on the day its board was drawn for — a past one, from the archive', async () => {
    await recordDailyMove(db, 'rugby', { ...move, day: ChallengeDay('2026-07-02') }, accepted(false), now)
    expect(repo.recordMove).toHaveBeenCalledWith(db, expect.objectContaining({ day: '2026-07-02', visitorId }))
  })

  it('never counts a move on a future day', async () => {
    await recordDailyMove(db, 'rugby', { ...move, day: ChallengeDay('2026-07-17') }, accepted(true), now)
    expect(repo.recordMove).not.toHaveBeenCalled()
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

  it('records a hint on a past day, played late', async () => {
    await recordDailyHint(db, 'rugby', ChallengeDay('2026-07-15'), visitorId, 'p-c', now)
    expect(repo.recordHint).toHaveBeenCalledWith(db, 'rugby', '2026-07-15', visitorId, 'p-c')
  })

  it('refuses a future day', async () => {
    await expect(recordDailyHint(db, 'rugby', ChallengeDay('2026-07-17'), visitorId, 'p-c', now)).rejects.toThrow(
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
      username: 'hasty:prop:042',
      outcome: 'won' as const,
      late: false,
      score: 0,
      added: 1,
      needed: 1,
      attempts: 2,
      durationMs: 61_000,
      livesLost: 0,
      links: 2,
      hints: 1,
      pathPlayerIds: ['p-a', 'p-c', 'p-b'],
      finishedAt: '2026-07-16T08:00:00Z',
    }
    repo.ranking.mockResolvedValue([entry])
    await expect(getDailyRanking(db, 'rugby', ChallengeDay('2026-07-16'))).resolves.toEqual([entry])
  })
})

describe('getDailyLeaderboard', () => {
  it("cuts today's ranking — the Paris day — down to the podium and the visitor's place", async () => {
    repo.ranking.mockResolvedValue([
      {
        rank: 1,
        visitorId,
        username: 'hasty:prop:042',
        outcome: 'won',
        late: false,
        score: 0,
        added: 1,
        needed: 1,
        attempts: 1,
        durationMs: 61_000,
        livesLost: 0,
        links: 2,
        hints: 0,
        pathPlayerIds: ['p-a', 'p-c', 'p-b'],
        finishedAt: '2026-07-16T08:00:00Z',
      },
    ])

    const board = await getDailyLeaderboard(db, 'rugby', visitorId, undefined, now)

    expect(repo.ranking).toHaveBeenCalledWith(db, 'rugby', '2026-07-16')
    expect(board).toEqual({
      day: '2026-07-16',
      total: 1,
      podium: [{ rank: 1, username: 'hasty:prop:042', score: 0, durationMs: 61_000, late: false, you: true }],
      you: { rank: 1, outcome: 'won', score: 0, durationMs: 61_000, late: false },
    })
  })

  it("reads a past day's ranking — the archive's", async () => {
    repo.ranking.mockResolvedValue([])

    const board = await getDailyLeaderboard(db, 'rugby', null, ChallengeDay('2026-07-02'), now)

    expect(repo.ranking).toHaveBeenCalledWith(db, 'rugby', '2026-07-02')
    expect(board).toEqual({ day: '2026-07-02', total: 0, podium: [], you: null })
  })

  it("refuses a future day — tomorrow's pair is drawn, and hidden", async () => {
    await expect(getDailyLeaderboard(db, 'rugby', null, ChallengeDay('2026-07-17'), now)).rejects.toThrow(ConflictError)
    expect(repo.ranking).not.toHaveBeenCalled()
  })
})

describe('getDailyStats', () => {
  it("computes the visitor's stats as of today — the Paris day", async () => {
    repo.visitorDays.mockResolvedValue([
      { day: ChallengeDay('2026-07-15'), outcome: 'won', score: 0, livesLost: 0, late: false },
      { day: ChallengeDay('2026-07-16'), outcome: 'won', score: 2, livesLost: 1, late: false },
    ])

    const stats = await getDailyStats(db, 'rugby', visitorId, now)

    expect(repo.visitorDays).toHaveBeenCalledWith(db, 'rugby', visitorId)
    expect(stats).toMatchObject({ played: 2, currentStreak: 2, today: 2, distribution: [1, 0, 1, 0, 0, 0] })
  })
})
