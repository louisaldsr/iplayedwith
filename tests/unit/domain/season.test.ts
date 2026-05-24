import { Season } from '@/domain/season'

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
