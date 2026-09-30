import { dailyOutcomesToday, readDailyRecord, saveDailyRecord } from '@/lib/dailyProgress'
import { ChallengeDay, DAILY_LIVES } from '@/domain/dailyChallenge'

const today = ChallengeDay('2026-07-15')
// 10:00 in Paris on 2026-07-15.
const now = new Date('2026-07-15T08:00:00Z')

beforeEach(() => window.localStorage.clear())
afterEach(() => jest.restoreAllMocks())

describe('readDailyRecord', () => {
  it('starts a never-played day with every life', () => {
    expect(readDailyRecord('rugby', today)).toEqual({ livesLeft: DAILY_LIVES })
  })

  it('keeps the lives already lost today, so a reload does not refill them', () => {
    saveDailyRecord('rugby', today, { livesLeft: 1 })
    expect(readDailyRecord('rugby', today)).toEqual({ livesLeft: 1, outcome: undefined })
  })

  it("starts fresh on a new day, whatever yesterday's record says", () => {
    saveDailyRecord('rugby', ChallengeDay('2026-07-14'), { livesLeft: 0, outcome: 'lost' })
    expect(readDailyRecord('rugby', today)).toEqual({ livesLeft: DAILY_LIVES })
  })

  it('treats a corrupted or out-of-range record safely', () => {
    window.localStorage.setItem('ipw.daily.rugby', '{not json')
    expect(readDailyRecord('rugby', today)).toEqual({ livesLeft: DAILY_LIVES })

    window.localStorage.setItem('ipw.daily.rugby', JSON.stringify({ day: today, livesLeft: 99 }))
    expect(readDailyRecord('rugby', today).livesLeft).toBe(DAILY_LIVES)
  })
})

describe('dailyOutcomesToday', () => {
  it('lists the finished challenges of the current day, won or lost, per sport', () => {
    saveDailyRecord('rugby', today, { livesLeft: 2, outcome: 'won' })
    saveDailyRecord('football', today, { livesLeft: 0, outcome: 'lost' })

    expect(dailyOutcomesToday(now)).toEqual(
      new Map([
        ['rugby', 'won'],
        ['football', 'lost'],
      ]),
    )
  })

  it('leaves out a day still in progress, and forgets at midnight Paris', () => {
    saveDailyRecord('rugby', today, { livesLeft: 2 })
    saveDailyRecord('football', today, { livesLeft: 1, outcome: 'won' })

    expect(dailyOutcomesToday(now)).toEqual(new Map([['football', 'won']]))
    // 00:30 in Paris on the 16th, still the 15th in UTC.
    expect(dailyOutcomesToday(new Date('2026-07-15T22:30:00Z'))).toEqual(new Map())
  })
})

describe('when storage is unavailable', () => {
  it('plays with full lives and remembers nothing, without throwing', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(() => saveDailyRecord('rugby', today, { livesLeft: 1 })).not.toThrow()
    expect(readDailyRecord('rugby', today)).toEqual({ livesLeft: DAILY_LIVES })
    expect(dailyOutcomesToday(now)).toEqual(new Map())
  })
})
