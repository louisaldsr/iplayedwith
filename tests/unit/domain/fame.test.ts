import { parseFameDetails } from '@/domain/fame'

/**
 * `fame_details` is an open jsonb bag written by import scripts, so a row can carry a key this
 * build has never heard of, or a key written in the wrong type by an older script. Reading it
 * must never throw — the SQL side takes the same stance, treating a non-numeric count as 0
 * rather than failing a whole batch.
 */
describe('parseFameDetails', () => {
  it('reads the signals an import writes', () => {
    expect(parseFameDetails({ gamesPlayed: 250, caps: 99, seasons: 13, updatedAt: '2026-09-21T10:00:00Z' })).toEqual({
      gamesPlayed: 250,
      caps: 99,
      seasons: 13,
      updatedAt: '2026-09-21T10:00:00Z',
    })
  })

  it('keeps zero, which is a real signal and not a missing one', () => {
    expect(parseFameDetails({ gamesPlayed: 0, caps: 0, seasons: 0 })).toEqual({
      gamesPlayed: 0,
      caps: 0,
      seasons: 0,
    })
  })

  it('drops a key written with the wrong type instead of throwing', () => {
    expect(parseFameDetails({ gamesPlayed: 'lots', caps: 99 })).toEqual({ caps: 99 })
    expect(parseFameDetails({ updatedAt: 1758448800 })).toEqual({})
  })

  it('drops non-finite numbers', () => {
    expect(parseFameDetails({ gamesPlayed: NaN, caps: Infinity })).toEqual({})
  })

  it('ignores a key it does not know, so a future signal cannot break an old build', () => {
    expect(parseFameDetails({ caps: 12, appearance: 5000 })).toEqual({ caps: 12 })
  })

  it('returns an empty bag for anything that is not an object', () => {
    expect(parseFameDetails({})).toEqual({})
    expect(parseFameDetails(null)).toEqual({})
    expect(parseFameDetails(undefined)).toEqual({})
    expect(parseFameDetails('{"caps":12}')).toEqual({})
    expect(parseFameDetails(42)).toEqual({})
  })
})
