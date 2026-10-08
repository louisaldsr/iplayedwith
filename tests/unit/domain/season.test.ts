import {
  endYear,
  formatSeasonSpan,
  isAfterLatestSeason,
  isSeason,
  LATEST_SEASON,
  Season,
  seasonFormatOf,
  startYear,
} from '@/domain/season'

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

    it('accepts a calendar season, a single year (Formula 1)', () => {
      expect(Season('2022')).toBe('2022')
      expect(isSeason('1950')).toBe(true)
    })
  })

  describe('invalid format', () => {
    it('throws on a short year', () => {
      expect(() => Season('22')).toThrow('Invalid season format: 22')
      expect(() => Season('2022-23')).toThrow('Invalid season format: 2022-23')
      expect(() => Season('20222')).toThrow('Invalid season format: 20222')
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

describe('reading a season', () => {
  it('knows its shape', () => {
    expect(seasonFormatOf(Season('2022-2023'))).toBe('split')
    expect(seasonFormatOf(Season('2022'))).toBe('calendar')
  })

  it('reads the start and end years of both shapes', () => {
    expect([startYear(Season('2022-2023')), endYear(Season('2022-2023'))]).toEqual([2022, 2023])
    expect([startYear(Season('2022')), endYear(Season('2022'))]).toEqual([2022, 2022])
  })

  it('spells a run of seasons from its first year to its last', () => {
    expect(formatSeasonSpan(Season('2015-2016'), Season('2019-2020'))).toBe('2015 – 2020')
    expect(formatSeasonSpan(Season('2015-2016'), Season('2015-2016'))).toBe('2015 – 2016')
    expect(formatSeasonSpan(Season('2015'), Season('2019'))).toBe('2015 – 2019')
    expect(formatSeasonSpan(Season('2021'), Season('2021'))).toBe('2021')
  })
})

describe('isAfterLatestSeason, for a calendar season', () => {
  const latestStart = Number(LATEST_SEASON.slice(0, 4))

  it('keeps the calendar year the latest season starts in, skips the one being raced after it', () => {
    expect(isAfterLatestSeason(Season(String(latestStart)))).toBe(false)
    expect(isAfterLatestSeason(Season(String(latestStart + 1)))).toBe(true)
  })
})
