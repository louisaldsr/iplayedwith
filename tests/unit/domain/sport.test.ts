import { SPORTS, isSportId } from '@/domain/sport'

describe('isSportId', () => {
  it('accepts every value in SPORTS', () => {
    for (const sport of SPORTS) {
      expect(isSportId(sport)).toBe(true)
    }
  })

  it('rejects an unknown sport', () => {
    expect(isSportId('basketball')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isSportId('')).toBe(false)
  })
})
