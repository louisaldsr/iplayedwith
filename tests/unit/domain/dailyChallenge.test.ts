import { ChallengeDay, challengeDayOf } from '@/domain/dailyChallenge'

describe('ChallengeDay', () => {
  it('accepts a real calendar day', () => {
    expect(ChallengeDay('2026-09-25')).toBe('2026-09-25')
    expect(ChallengeDay('2028-02-29')).toBe('2028-02-29')
  })

  it.each(['2026-9-25', '25/09/2026', '2026-09-25T00:00:00Z', ''])('rejects the malformed "%s"', (raw) => {
    expect(() => ChallengeDay(raw)).toThrow('Invalid challenge day format')
  })

  it.each(['2026-02-30', '2027-02-29', '2026-13-01'])('rejects the non-existent day %s', (raw) => {
    expect(() => ChallengeDay(raw)).toThrow('Invalid challenge day')
  })
})

describe('challengeDayOf — one day for everyone, on Paris time', () => {
  it('rolls over at midnight Paris, not midnight UTC (summer, UTC+2)', () => {
    expect(challengeDayOf(new Date('2026-07-14T21:59:59Z'))).toBe('2026-07-14')
    expect(challengeDayOf(new Date('2026-07-14T22:00:00Z'))).toBe('2026-07-15')
  })

  it('follows the winter offset (UTC+1)', () => {
    expect(challengeDayOf(new Date('2026-01-10T22:59:59Z'))).toBe('2026-01-10')
    expect(challengeDayOf(new Date('2026-01-10T23:00:00Z'))).toBe('2026-01-11')
  })
})
