import { importFameDetails, refreshFameSeasons } from '@/services/fameService'
import * as playersRepo from '@/repositories/playersRepository'
import { ValidationError } from '@/services/errors'

jest.mock('@/repositories/playersRepository')

const db = {} as never
const mockedRepo = jest.mocked(playersRepo)

beforeEach(() => {
  mockedRepo.applyFameDetails.mockResolvedValue(0)
  mockedRepo.refreshFameSeasons.mockResolvedValue(0)
})
afterEach(() => jest.clearAllMocks())

const row = (playerId: string, gamesPlayed: number, caps: number) => ({ playerId, gamesPlayed, caps })

describe('importFameDetails', () => {
  it('writes the details then refreshes seasons, and reports both counts', async () => {
    mockedRepo.applyFameDetails.mockResolvedValue(2)
    mockedRepo.refreshFameSeasons.mockResolvedValue(11455)

    const result = await importFameDetails(db, 'football', [row('p1', 412, 68), row('p2', 12, 0)])

    expect(result).toEqual({ written: 2, seasonsRefreshed: 11455 })
    expect(mockedRepo.refreshFameSeasons).toHaveBeenCalledWith(db, 'football')
  })

  it('refreshes seasons after writing, never before', async () => {
    // Order matters: seasons are derived from memberships, but the intensity term needs the
    // games this call is writing. Refreshing first would score on last run's numbers.
    const calls: string[] = []
    mockedRepo.applyFameDetails.mockImplementation(async () => {
      calls.push('apply')
      return 1
    })
    mockedRepo.refreshFameSeasons.mockImplementation(async () => {
      calls.push('refresh')
      return 1
    })

    await importFameDetails(db, 'rugby', [row('p1', 250, 99)])

    expect(calls).toEqual(['apply', 'refresh'])
  })

  it('stamps every row with a timestamp, so stale rows are detectable later', async () => {
    await importFameDetails(db, 'rugby', [row('p1', 250, 99)])

    const [, , rows] = mockedRepo.applyFameDetails.mock.calls[0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ playerId: 'p1', details: { gamesPlayed: 250, caps: 99 } })
    expect(Date.parse(rows[0].details.updatedAt as string)).not.toBeNaN()
  })

  it('never writes `seasons` — that is derived in SQL from memberships', async () => {
    await importFameDetails(db, 'rugby', [row('p1', 250, 99)])

    const [, , rows] = mockedRepo.applyFameDetails.mock.calls[0]
    expect(rows[0].details).not.toHaveProperty('seasons')
  })

  it('does not write anything when a row is invalid', async () => {
    // Validation runs over the whole batch first, so a bad row fails the call instead of
    // landing half of itself — same stance as upsertMembershipsBulk.
    await expect(importFameDetails(db, 'rugby', [row('p1', 100, 0), row('p2', -1, 0)])).rejects.toThrow(ValidationError)

    expect(mockedRepo.applyFameDetails).not.toHaveBeenCalled()
    expect(mockedRepo.refreshFameSeasons).not.toHaveBeenCalled()
  })

  it('rejects an implausible count rather than letting a shifted column through', async () => {
    // A minutes-played value landing in gamesPlayed would quietly promote a journeyman to the
    // top, and the √ curve would hide it by clamping the value back into range.
    await expect(importFameDetails(db, 'rugby', [row('p1', 58_000, 0)])).rejects.toThrow(/implausibly high/)
  })

  it('accepts the real record holder, just under the ceiling', async () => {
    // Lewandowski is at 665 games in the football dataset; the guard must not reject him.
    await expect(importFameDetails(db, 'football', [row('p1', 665, 167)])).resolves.toBeDefined()
  })

  it('rejects a non-integer count', async () => {
    await expect(importFameDetails(db, 'rugby', [row('p1', 12.5, 0)])).rejects.toThrow(/whole number/)
    await expect(importFameDetails(db, 'rugby', [row('p1', NaN, 0)])).rejects.toThrow(/whole number/)
  })

  it('rejects a row with no player id', async () => {
    await expect(importFameDetails(db, 'rugby', [row('', 1, 0)])).rejects.toThrow(/playerId is required/)
  })

  it('accepts zero — an unknown player is a real signal, not a missing one', async () => {
    await importFameDetails(db, 'rugby', [row('p1', 0, 0)])

    const [, , rows] = mockedRepo.applyFameDetails.mock.calls[0]
    expect(rows[0].details).toMatchObject({ gamesPlayed: 0, caps: 0 })
  })

  it('still refreshes seasons for an empty batch, so a re-run is not a no-op', async () => {
    mockedRepo.refreshFameSeasons.mockResolvedValue(7823)

    await expect(importFameDetails(db, 'rugby', [])).resolves.toMatchObject({ seasonsRefreshed: 7823 })
  })
})

describe('refreshFameSeasons', () => {
  it('recounts seasons without touching the imported signals', async () => {
    mockedRepo.refreshFameSeasons.mockResolvedValue(7823)

    await expect(refreshFameSeasons(db, 'rugby')).resolves.toBe(7823)
    expect(mockedRepo.applyFameDetails).not.toHaveBeenCalled()
  })
})
