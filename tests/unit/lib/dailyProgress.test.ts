import { markDailyDone, sportsDoneToday } from '@/lib/dailyProgress'
import { ChallengeDay } from '@/domain/dailyChallenge'

// 10:00 in Paris on 2026-07-15.
const now = new Date('2026-07-15T08:00:00Z')

beforeEach(() => window.localStorage.clear())
afterEach(() => jest.restoreAllMocks())

describe('daily progress', () => {
  it('marks a sport as done for the day it was won', () => {
    markDailyDone('rugby', ChallengeDay('2026-07-15'))
    expect(sportsDoneToday(now)).toEqual(new Set(['rugby']))
  })

  it('forgets it the next day (Paris time) with nothing to clean up', () => {
    markDailyDone('rugby', ChallengeDay('2026-07-15'))
    // 00:30 in Paris on the 16th, still the 15th in UTC.
    expect(sportsDoneToday(new Date('2026-07-15T22:30:00Z'))).toEqual(new Set())
  })

  it('tracks each sport on its own', () => {
    markDailyDone('football', ChallengeDay('2026-07-15'))
    expect(sportsDoneToday(now)).toEqual(new Set(['football']))
  })

  it('shows nothing as done when storage is unavailable, without throwing', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(() => markDailyDone('rugby', ChallengeDay('2026-07-15'))).not.toThrow()
    expect(sportsDoneToday(now)).toEqual(new Set())
  })
})
