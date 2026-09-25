import { importFameDetails } from '@/services/fameService'
import * as playersRepo from '@/repositories/playersRepository'
import { ValidationError } from '@/services/errors'

jest.mock('@/repositories/playersRepository')

const db = {} as never
const mockedRepo = jest.mocked(playersRepo)

beforeEach(() => {
  mockedRepo.applyFameDetails.mockResolvedValue(0)
})
afterEach(() => jest.clearAllMocks())

const row = (playerId: string, caps: number) => ({ playerId, caps })

describe('importFameDetails', () => {
  it('writes the details and reports how many rows landed', async () => {
    mockedRepo.applyFameDetails.mockResolvedValue(2)

    await expect(importFameDetails(db, 'football', [row('p1', 68), row('p2', 0)])).resolves.toEqual({ written: 2 })
    expect(mockedRepo.applyFameDetails).toHaveBeenCalledTimes(1)
  })

  it('stamps every row with a timestamp, so stale rows are detectable later', async () => {
    await importFameDetails(db, 'rugby', [row('p1', 99)])

    const [, , rows] = mockedRepo.applyFameDetails.mock.calls[0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ playerId: 'p1', details: { caps: 99 } })
    expect(Date.parse(rows[0].details.updatedAt as string)).not.toBeNaN()
  })

  it('writes nothing that memberships already carry', async () => {
    // Games and seasons are read from memberships when the score is computed. Writing them here
    // too would bring back two copies that can drift into different scopes.
    await importFameDetails(db, 'rugby', [row('p1', 99)])

    const [, , rows] = mockedRepo.applyFameDetails.mock.calls[0]
    expect(Object.keys(rows[0].details).sort()).toEqual(['caps', 'updatedAt'])
  })

  it('does not write anything when a row is invalid', async () => {
    // Validation runs over the whole batch first, so a bad row fails the call instead of
    // landing half of itself — same stance as upsertMembershipsBulk.
    await expect(importFameDetails(db, 'rugby', [row('p1', 3), row('p2', -1)])).rejects.toThrow(ValidationError)
    expect(mockedRepo.applyFameDetails).not.toHaveBeenCalled()
  })

  it('rejects an implausible count rather than letting a shifted column through', async () => {
    await expect(importFameDetails(db, 'rugby', [row('p1', 58_000)])).rejects.toThrow(/implausibly high/)
  })

  it('accepts the most-capped real player', async () => {
    await expect(importFameDetails(db, 'football', [row('p1', 233)])).resolves.toBeDefined()
  })

  it('rejects a non-integer count', async () => {
    await expect(importFameDetails(db, 'rugby', [row('p1', 12.5)])).rejects.toThrow(/whole number/)
    await expect(importFameDetails(db, 'rugby', [row('p1', NaN)])).rejects.toThrow(/whole number/)
  })

  it('rejects a row with no player id', async () => {
    await expect(importFameDetails(db, 'rugby', [row('', 1)])).rejects.toThrow(/playerId is required/)
  })

  it('accepts zero — an uncapped player is a real signal, not a missing one', async () => {
    await importFameDetails(db, 'rugby', [row('p1', 0)])

    const [, , rows] = mockedRepo.applyFameDetails.mock.calls[0]
    expect(rows[0].details).toMatchObject({ caps: 0 })
  })
})
