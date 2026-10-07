import { ChallengeDay } from '@/domain/dailyChallenge'
import { DailyRankingEntry, VisitorId } from '@/domain/dailyResult'
import { toLeaderboard } from '@/domain/dailyLeaderboard'

const day = ChallengeDay('2026-10-07')
const visitor = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as VisitorId

let finished = 0
const won = (n: number, rank: number, score: number, durationMs = 60_000): DailyRankingEntry => ({
  rank,
  visitorId: visitor(n),
  username: `name${n}`,
  outcome: 'won',
  late: false,
  score,
  added: score + 1,
  needed: 1,
  attempts: score + 1,
  durationMs,
  livesLost: 0,
  links: 2,
  hints: 0,
  pathPlayerIds: ['p-a', `p-${n}`, 'p-b'],
  finishedAt: `2026-10-07T08:${String(finished++).padStart(2, '0')}:00Z`,
})
const lost = (n: number, rank: number): DailyRankingEntry => ({
  ...won(n, rank, 0),
  outcome: 'lost',
  score: null,
  links: null,
  pathPlayerIds: null,
})

describe('toLeaderboard', () => {
  it('puts the first three winners on the podium, in the ranking order', () => {
    const board = toLeaderboard([won(1, 1, 0), won(2, 2, 1), won(3, 3, 1), won(4, 4, 2), lost(5, 5)], day, null)

    expect(board.podium.map((e) => e.username)).toEqual(['name1', 'name2', 'name3'])
    expect(board.podium[0]).toEqual({
      rank: 1,
      username: 'name1',
      score: 0,
      durationMs: 60_000,
      late: false,
      you: false,
    })
  })

  it('never puts a loser on the podium — fewer winners, a shorter podium', () => {
    const board = toLeaderboard([won(1, 1, 0), lost(2, 2), lost(3, 2)], day, null)
    expect(board.podium.map((e) => e.username)).toEqual(['name1'])
  })

  it('keeps shared ranks, and cuts a tie on the last step in the ranking order', () => {
    const board = toLeaderboard([won(1, 1, 0), won(2, 2, 1), won(3, 2, 1), won(4, 2, 1)], day, null)
    expect(board.podium.map((e) => [e.rank, e.username])).toEqual([
      [1, 'name1'],
      [2, 'name2'],
      [2, 'name3'],
    ])
  })

  it('counts every finished result in the total, losers included', () => {
    expect(toLeaderboard([won(1, 1, 0), lost(2, 2), lost(3, 2)], day, null).total).toBe(3)
    expect(toLeaderboard([], day, null)).toEqual({ day, total: 0, podium: [], you: null })
  })

  it('gives a winner their rank, score and time — and marks them on the podium', () => {
    const board = toLeaderboard([won(1, 1, 0), won(2, 2, 1, 95_000)], day, visitor(2))
    expect(board.you).toEqual({ rank: 2, outcome: 'won', score: 1, durationMs: 95_000, late: false })
    expect(board.podium.map((e) => e.you)).toEqual([false, true])
  })

  it('gives a loser the shared rank after the winners', () => {
    const board = toLeaderboard([won(1, 1, 0), lost(2, 2), lost(3, 2)], day, visitor(3))
    expect(board.you).toMatchObject({ rank: 2, outcome: 'lost', score: null })
  })

  it('marks a day played late — on the podium only after every on-time winner, as the ranking orders it', () => {
    const board = toLeaderboard([won(1, 1, 0), { ...won(2, 2, 0), late: true }], day, visitor(2))
    expect(board.podium.map((e) => [e.username, e.late])).toEqual([
      ['name1', false],
      ['name2', true],
    ])
    expect(board.you).toMatchObject({ rank: 2, late: true })
  })

  it('has no place for a visitor who has not finished the day', () => {
    expect(toLeaderboard([won(1, 1, 0)], day, visitor(9)).you).toBeNull()
  })

  it("never lets another visitor's id or a winning chain leave for the browser", () => {
    const json = JSON.stringify(toLeaderboard([won(1, 1, 0), won(2, 2, 1), lost(3, 3)], day, visitor(2)))
    expect(json).not.toContain(visitor(1))
    expect(json).not.toContain(visitor(2))
    expect(json).not.toContain('p-a')
    expect(json).not.toMatch(/visitorId|pathPlayerIds/)
  })
})
