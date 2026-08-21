import { Nationality } from '@/domain/nationality'

describe('Nationality smart constructor', () => {
  describe('valid code', () => {
    it('returns a branded string for a valid alpha-2 code', () => {
      const n = Nationality('FR')
      expect(n).toBe('FR')
    })

    it('normalizes lowercase input to uppercase', () => {
      const n = Nationality('fr')
      expect(n).toBe('FR')
    })

    it('accepts another valid code', () => {
      const n = Nationality('NZ')
      expect(n).toBe('NZ')
    })

    it('accepts the UK home-nation extended codes', () => {
      expect(Nationality('GB-ENG')).toBe('GB-ENG')
      expect(Nationality('GB-SCT')).toBe('GB-SCT')
      expect(Nationality('GB-WLS')).toBe('GB-WLS')
      expect(Nationality('GB-NIR')).toBe('GB-NIR')
    })

    it('normalizes a lowercase home-nation code to uppercase', () => {
      const n = Nationality('gb-nir')
      expect(n).toBe('GB-NIR')
    })

    it('still accepts plain GB', () => {
      const n = Nationality('GB')
      expect(n).toBe('GB')
    })
  })

  describe('invalid code', () => {
    it('throws on an unrecognized 2-letter code', () => {
      expect(() => Nationality('ZZ')).toThrow('Invalid nationality code: ZZ')
    })

    it('throws on an alpha-3 code', () => {
      expect(() => Nationality('FRA')).toThrow('Invalid nationality code: FRA')
    })

    it('throws on empty string', () => {
      expect(() => Nationality('')).toThrow('Invalid nationality code: ')
    })
  })
})
