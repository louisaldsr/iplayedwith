import { ChallengeDay } from '@/domain/dailyChallenge'
import {
  DailyDayResult,
  playersNeeded,
  dailyScore,
  dailyStats,
  formatScore,
  formatScoreBucket,
  scoreBucketOf,
} from '@/domain/dailyScore'

const won = (day: string, score: number): DailyDayResult => ({ day: ChallengeDay(day), outcome: 'won', score })
const lost = (day: string): DailyDayResult => ({ day: ChallengeDay(day), outcome: 'lost', score: null })
const unfinished = (day: string): DailyDayResult => ({ day: ChallengeDay(day), outcome: null, score: null })
const today = ChallengeDay('2026-10-05')

describe('dailyScore — the extra players', () => {
  it('needs the fewest players that connect A and B', () => {
    expect(playersNeeded(2)).toBe(1) // A — X — B
    expect(playersNeeded(4)).toBe(3)
  })

  it('counts every player added beyond those needed as one extra', () => {
    expect(dailyScore(1, 2)).toBe(0)
    expect(dailyScore(3, 2)).toBe(2)
    expect(dailyScore(5, 4)).toBe(2)
  })

  it('reads "Perfect" at zero, "+N" above — with no limit', () => {
    expect(formatScore(0, 'Perfect!')).toBe('Perfect!')
    expect(formatScore(2, 'Perfect!')).toBe('+2')
    expect(formatScore(14, 'Perfect!')).toBe('+14')
  })
})

describe('score buckets', () => {
  it('groups +5 and worse in the last bucket', () => {
    expect([0, 1, 4, 5, 14].map(scoreBucketOf)).toEqual([0, 1, 4, 5, 5])
    expect([0, 1, 4, 5].map((b) => formatScoreBucket(b, 'Perfect'))).toEqual(['Perfect', '+1', '+4', '+5+'])
  })
})

describe('dailyStats', () => {
  it('starts empty', () => {
    expect(dailyStats([], today)).toEqual({
      played: 0,
      won: 0,
      currentStreak: 0,
      bestStreak: 0,
      averageScore: null,
      distribution: [0, 0, 0, 0, 0, 0],
      lost: 0,
      today: null,
    })
  })

  it('counts finished days, the distribution and the average of won days', () => {
    const stats = dailyStats(
      [won('2026-10-01', 0), won('2026-10-02', 2), lost('2026-10-03'), won('2026-10-04', 10)],
      today,
    )
    expect(stats).toMatchObject({ played: 4, won: 3, lost: 1, distribution: [1, 0, 1, 0, 0, 1], averageScore: 4 })
  })

  it('does not count an unfinished day as played', () => {
    expect(dailyStats([unfinished('2026-10-04')], today)).toMatchObject({ played: 0, won: 0, lost: 0 })
  })

  it('keeps the streak alive while today is not finished', () => {
    const stats = dailyStats([won('2026-10-03', 0), won('2026-10-04', 1), unfinished('2026-10-05')], today)
    expect(stats).toMatchObject({ currentStreak: 2, today: null })
  })

  it('counts today once won', () => {
    const stats = dailyStats([won('2026-10-04', 1), won('2026-10-05', 0)], today)
    expect(stats).toMatchObject({ currentStreak: 2, today: 0 })
  })

  it('breaks the streak on a day lost today', () => {
    const stats = dailyStats([won('2026-10-04', 1), lost('2026-10-05')], today)
    expect(stats).toMatchObject({ currentStreak: 0, bestStreak: 1, today: 'lost' })
  })

  it('breaks the streak on a day missed, or started and never finished', () => {
    expect(dailyStats([won('2026-10-02', 0), won('2026-10-04', 0)], today).currentStreak).toBe(1)
    expect(dailyStats([won('2026-10-03', 0), unfinished('2026-10-04')], today).currentStreak).toBe(0)
  })

  it('finds the best run anywhere in the past, across months', () => {
    const stats = dailyStats(
      [won('2026-09-29', 0), won('2026-09-30', 0), won('2026-10-01', 3), lost('2026-10-02'), won('2026-10-04', 0)],
      today,
    )
    expect(stats).toMatchObject({ bestStreak: 3, currentStreak: 1 })
  })

  it('puts today in its bucket, overflow included', () => {
    expect(dailyStats([won('2026-10-05', 9)], today).today).toBe(5)
  })
})
