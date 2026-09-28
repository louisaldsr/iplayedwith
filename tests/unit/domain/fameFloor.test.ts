import { FAME_FLOORS, fameFloorKey, fameFloorOf, fameFloorRange } from '@/domain/fameFloor'

describe('fameFloorOf', () => {
  it('puts each boundary score on the floor it opens', () => {
    expect(fameFloorOf(100)).toBe(1)
    expect(fameFloorOf(70)).toBe(1)
    expect(fameFloorOf(69)).toBe(2)
    expect(fameFloorOf(30)).toBe(2)
    expect(fameFloorOf(29)).toBe(3)
    expect(fameFloorOf(0)).toBe(3)
  })

  it('gives no floor to a score that is not computed yet — unscored is not unknown', () => {
    expect(fameFloorOf(null)).toBeNull()
    expect(fameFloorOf(NaN)).toBeNull()
  })

  it('clamps a score outside 0..100 instead of rejecting it', () => {
    expect(fameFloorOf(140)).toBe(1)
    expect(fameFloorOf(-5)).toBe(3)
  })
})

describe('fameFloorRange', () => {
  it('gives the inclusive score range of each floor', () => {
    expect(fameFloorRange(1)).toEqual({ min: 70, max: 100 })
    expect(fameFloorRange(2)).toEqual({ min: 30, max: 69 })
    expect(fameFloorRange(3)).toEqual({ min: 0, max: 29 })
  })

  it('agrees with fameFloorOf on every score — the ranges tile 0..100 with no gap or overlap', () => {
    for (let score = 0; score <= 100; score++) {
      const containing = FAME_FLOORS.filter((f) => {
        const { min, max } = fameFloorRange(f.floor)
        return score >= min && score <= max
      })
      expect(containing.map((f) => f.floor)).toEqual([fameFloorOf(score)])
    }
  })
})

describe('FAME_FLOORS', () => {
  it('lists floors in order, thresholds strictly decreasing down to 0', () => {
    FAME_FLOORS.forEach((f, i) => {
      expect(f.floor).toBe(i + 1)
      if (i > 0) expect(f.minScore).toBeLessThan(FAME_FLOORS[i - 1].minScore)
    })
    expect(FAME_FLOORS[FAME_FLOORS.length - 1].minScore).toBe(0)
  })

  it('has unique keys', () => {
    expect(new Set(FAME_FLOORS.map((f) => f.key)).size).toBe(FAME_FLOORS.length)
    expect(fameFloorKey(3)).toBe('unsung')
  })
})
