import { isAfterLatestSeason, LATEST_SEASON, Season } from '@/domain/season'

describe('Season smart constructor', () => {
  describe('valid season', () => {
    it('returns a branded string for a valid consecutive season', () => {
      const s = Season('2022-2023')
      expect(s).toBe('2022-2023')
    })

    it('accepts another valid season', () => {
      const s = Season('1999-2000')
      expect(s).toBe('1999-2000')
    })
  })

  describe('invalid format', () => {
    it('throws on a single year string', () => {
      expect(() => Season('2022')).toThrow('Invalid season format: 2022')
    })

    it('throws on slash separator instead of dash', () => {
      expect(() => Season('2022/2023')).toThrow('Invalid season format: 2022/2023')
    })

    it('throws on alphabetic input', () => {
      expect(() => Season('abcd-efgh')).toThrow('Invalid season format: abcd-efgh')
    })

    it('throws on empty string', () => {
      expect(() => Season('')).toThrow('Invalid season format: ')
    })
  })

  describe('non-consecutive years', () => {
    it('throws when end year is two years after start', () => {
      expect(() => Season('2020-2022')).toThrow('Invalid season range: 2020-2022')
    })

    it('throws when end year equals start year', () => {
      expect(() => Season('2022-2022')).toThrow('Invalid season range: 2022-2022')
    })

    it('throws when end year is before start year', () => {
      expect(() => Season('2023-2022')).toThrow('Invalid season range: 2023-2022')
    })
  })
})

describe('isAfterLatestSeason', () => {
  // Relative to LATEST_SEASON, so moving the dataset forward does not break these.
  const latestStart = Number(LATEST_SEASON.slice(0, 4))
  const seasonStarting = (year: number) => Season(`${year}-${year + 1}`)

  it('keeps the latest season itself', () => {
    expect(isAfterLatestSeason(LATEST_SEASON)).toBe(false)
  })

  it('keeps every earlier season', () => {
    expect(isAfterLatestSeason(seasonStarting(latestStart - 1))).toBe(false)
    expect(isAfterLatestSeason(Season('1999-2000'))).toBe(false)
  })

  it('rejects the season in progress after it, and anything later', () => {
    expect(isAfterLatestSeason(seasonStarting(latestStart + 1))).toBe(true)
    expect(isAfterLatestSeason(seasonStarting(latestStart + 10))).toBe(true)
  })
})
