import { parseFameDetails } from '@/domain/fame'

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
