import { parseFameDetails, parseFameTerms } from '@/domain/fame'

/**
 * `player_fame.details` is an open jsonb bag written by import scripts, so a row can carry a
 * key this build has never heard of, or a key written in the wrong type by an older script.
 * Reading it must never throw.
 */
describe('parseFameDetails', () => {
  it('reads the signals an import writes', () => {
    expect(parseFameDetails({ caps: 99, updatedAt: '2026-09-21T10:00:00Z' })).toEqual({
      caps: 99,
      updatedAt: '2026-09-21T10:00:00Z',
    })
  })

  it('keeps zero, which is a real signal and not a missing one', () => {
    expect(parseFameDetails({ caps: 0 })).toEqual({ caps: 0 })
  })

  it('drops a key written with the wrong type instead of throwing', () => {
    expect(parseFameDetails({ caps: 'lots' })).toEqual({})
    expect(parseFameDetails({ updatedAt: 1758448800 })).toEqual({})
  })

  it('drops non-finite numbers', () => {
    expect(parseFameDetails({ caps: Infinity })).toEqual({})
    expect(parseFameDetails({ caps: NaN })).toEqual({})
  })

  it('ignores keys it does not know — including the ones moved to memberships', () => {
    // `gamesPlayed` and `seasons` lived here before 011; a row that still carried them must not
    // resurface them, since the score reads games and seasons from memberships only.
    expect(parseFameDetails({ caps: 12, gamesPlayed: 250, seasons: 13, appearance: 5000 })).toEqual({ caps: 12 })
  })

  it('returns an empty bag for anything that is not an object', () => {
    expect(parseFameDetails({})).toEqual({})
    expect(parseFameDetails(null)).toEqual({})
    expect(parseFameDetails(undefined)).toEqual({})
    expect(parseFameDetails('{"caps":12}')).toEqual({})
    expect(parseFameDetails(42)).toEqual({})
  })
})

describe('parseFameDetails — revision 3 signals', () => {
  it('reads caps by nation and the exposure signals', () => {
    expect(
      parseFameDetails({
        capsByNation: { France: 64, bad: 'x' },
        wikidataId: 'Q20666534',
        wikidataMatch: 'id',
        viewsPerYear: 1096808,
        viewsWindow: '202310-202609',
      }),
    ).toEqual({
      capsByNation: { France: 64 },
      wikidataId: 'Q20666534',
      wikidataMatch: 'id',
      viewsPerYear: 1096808,
      viewsWindow: '202310-202609',
    })
  })

  it('keeps an explicit null — no match, or no article — apart from a missing key', () => {
    expect(parseFameDetails({ wikidataId: null, wikidataMatch: null, viewsPerYear: null })).toEqual({
      wikidataId: null,
      wikidataMatch: null,
      viewsPerYear: null,
    })
    expect(parseFameDetails({ wikidataMatch: 'guess', viewsPerYear: 'many' })).toEqual({})
  })
})

describe('parseFameTerms', () => {
  it('reads the four pillars, exposure possibly null', () => {
    expect(parseFameTerms({ longevity: 0.84, club: 1, intl: 0.89, exposure: null })).toEqual({
      longevity: 0.84,
      club: 1,
      intl: 0.89,
      exposure: null,
    })
  })

  it('returns null for a row not scored by revision 3', () => {
    expect(parseFameTerms(null)).toBeNull()
    expect(parseFameTerms({ longevity: 0.5 })).toBeNull()
  })
})
