import { parsePrestigeDetails } from '@/domain/prestige'

/**
 * `club_season_prestige.details` is an open jsonb bag written by import scripts, like
 * `player_fame.details`: reading it must never throw.
 */
describe('parsePrestigeDetails', () => {
  it('reads the continental run an import writes', () => {
    expect(parsePrestigeDetails({ continentalWins: { 'Champions Cup': 8, 'Challenge Cup': 0 } })).toEqual({
      continentalWins: { 'Champions Cup': 8, 'Challenge Cup': 0 },
    })
  })

  it('skips a malformed entry and keeps the rest', () => {
    expect(
      parsePrestigeDetails({ continentalWins: { 'Champions League': 'lots', 'Europa League': 9, x: -2, y: NaN } }),
    ).toEqual({ continentalWins: { 'Europa League': 9 } })
  })

  it('ignores keys it does not know', () => {
    expect(parsePrestigeDetails({ attendance: 70000 })).toEqual({})
  })

  it('returns an empty bag for anything that is not an object', () => {
    expect(parsePrestigeDetails(null)).toEqual({})
    expect(parsePrestigeDetails([1, 2])).toEqual({})
    expect(parsePrestigeDetails('{}')).toEqual({})
    expect(parsePrestigeDetails({ continentalWins: [8] })).toEqual({})
  })
})
