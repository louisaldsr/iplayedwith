import {
  computeFameScores,
  importExposure,
  importFameDetails,
  importMembershipStats,
  importNationTiers,
} from '@/services/fameService'
import * as playersRepo from '@/repositories/playersRepository'
import * as membershipsRepo from '@/repositories/membershipsRepository'
import { ValidationError } from '@/services/errors'

jest.mock('@/repositories/playersRepository')
jest.mock('@/repositories/membershipsRepository')

const db = {} as never
const mockedRepo = jest.mocked(playersRepo)
const mockedMemberships = jest.mocked(membershipsRepo)

beforeEach(() => {
  mockedRepo.applyFameDetails.mockResolvedValue(0)
  mockedRepo.replaceNationTiers.mockResolvedValue(0)
  mockedMemberships.applyMembershipStats.mockResolvedValue(0)
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

describe('computeFameScores', () => {
  it('scores the requested sport and reports how many rows were scored', async () => {
    mockedRepo.computeFameScores.mockResolvedValue(7_529)

    await expect(computeFameScores(db, 'rugby')).resolves.toEqual({ scored: 7_529 })
    expect(mockedRepo.computeFameScores).toHaveBeenCalledWith(db, 'rugby')
  })

  it('surfaces a failure, e.g. a sport with no calibration row', async () => {
    mockedRepo.computeFameScores.mockRejectedValue(new Error('no fame_calibration row for sport rugby'))

    await expect(computeFameScores(db, 'rugby')).rejects.toThrow(/fame_calibration/)
  })
})

describe('importFameDetails — caps by nation', () => {
  it('writes the caps by nation next to the total', async () => {
    await importFameDetails(db, 'rugby', [{ playerId: 'p1', caps: 7, capsByNation: { Géorgie: 6, Lions: 1 } }])
    const [, , rows] = mockedRepo.applyFameDetails.mock.calls[0]
    expect(rows[0].details).toMatchObject({ caps: 7, capsByNation: { Géorgie: 6, Lions: 1 } })
  })

  it('rejects an implausible count for one nation, and an empty nation', async () => {
    await expect(
      importFameDetails(db, 'rugby', [{ playerId: 'p1', caps: 1, capsByNation: { France: 9999 } }]),
    ).rejects.toThrow(/implausibly high/)
    await expect(
      importFameDetails(db, 'rugby', [{ playerId: 'p1', caps: 1, capsByNation: { ' ': 1 } }]),
    ).rejects.toThrow(/empty nation/)
  })
})

describe('importMembershipStats', () => {
  const stats = (extra: object = {}) => ({ playerId: 'p1', clubId: 'c1', season: '2023-2024', ...extra })

  it('passes starts and minutes through, and leaves an omitted figure out', async () => {
    mockedMemberships.applyMembershipStats.mockResolvedValue(2)
    await expect(
      importMembershipStats(db, 'rugby', [
        stats({ starts: 18, minutes: 1430 }),
        stats({ season: '2022-2023', minutes: null }),
      ]),
    ).resolves.toEqual({ written: 2 })
    const [, , rows] = mockedMemberships.applyMembershipStats.mock.calls[0]
    expect(rows[0]).toMatchObject({ starts: 18, minutes: 1430 })
    expect(rows[1]).toEqual({ playerId: 'p1', clubId: 'c1', season: '2022-2023', minutes: null })
  })

  it('writes nothing when a row is invalid', async () => {
    await expect(importMembershipStats(db, 'rugby', [stats({ starts: -1 })])).rejects.toThrow(ValidationError)
    await expect(importMembershipStats(db, 'rugby', [stats({ minutes: 50_000 })])).rejects.toThrow(/implausibly/)
    await expect(importMembershipStats(db, 'rugby', [stats({ season: '23/24' })])).rejects.toThrow(/invalid season/)
    expect(mockedMemberships.applyMembershipStats).not.toHaveBeenCalled()
  })

  it('accepts a full NBA season of starts, playoffs included, and still rejects a games-sized typo', async () => {
    mockedMemberships.applyMembershipStats.mockResolvedValue(1)
    await expect(importMembershipStats(db, 'basketball', [stats({ starts: 104 })])).resolves.toEqual({ written: 1 })
    await expect(importMembershipStats(db, 'basketball', [stats({ starts: 251 })])).rejects.toThrow(/implausibly/)
  })
})

describe('importNationTiers', () => {
  it('replaces the tiers of its source', async () => {
    mockedRepo.replaceNationTiers.mockResolvedValue(2)
    const rows = [
      { nation: 'Spain', weight: 1 },
      { nation: 'Norway', weight: 0.2 },
    ]
    await expect(importNationTiers(db, 'football', 'fifa-ranking', rows)).resolves.toEqual({ written: 2 })
    expect(mockedRepo.replaceNationTiers).toHaveBeenCalledWith(db, 'football', 'fifa-ranking', rows)
  })

  it('refuses a weight outside (0, 1], a nation listed twice, and no source', async () => {
    await expect(importNationTiers(db, 'football', 'x', [{ nation: 'Spain', weight: 0 }])).rejects.toThrow(/weight/)
    await expect(importNationTiers(db, 'football', 'x', [{ nation: 'Spain', weight: 1.5 }])).rejects.toThrow(/weight/)
    await expect(
      importNationTiers(db, 'football', 'x', [
        { nation: 'Spain', weight: 1 },
        { nation: 'Spain', weight: 0.5 },
      ]),
    ).rejects.toThrow(/twice/)
    await expect(importNationTiers(db, 'football', ' ', [])).rejects.toThrow(/source/)
    expect(mockedRepo.replaceNationTiers).not.toHaveBeenCalled()
  })
})

describe('importExposure', () => {
  const exposure = (extra: object = {}) => ({
    playerId: 'p1',
    wikidataId: 'Q20666534',
    match: 'id' as const,
    viewsPerYear: 1_096_808,
    viewsWindow: '202310-202609',
    ...extra,
  })

  it('writes the match and the views, stamped', async () => {
    await importExposure(db, 'rugby', [exposure()])
    const [, , rows] = mockedRepo.applyFameDetails.mock.calls[0]
    expect(rows[0].details).toMatchObject({
      wikidataId: 'Q20666534',
      wikidataMatch: 'id',
      viewsPerYear: 1_096_808,
      viewsWindow: '202310-202609',
    })
    expect(Date.parse(rows[0].details.updatedAt as string)).not.toBeNaN()
  })

  it('writes an explicit null for a player with no match, so an old match cannot survive', async () => {
    await importExposure(db, 'rugby', [exposure({ wikidataId: null, match: null, viewsPerYear: null })])
    const [, , rows] = mockedRepo.applyFameDetails.mock.calls[0]
    expect(rows[0].details).toMatchObject({ wikidataId: null, wikidataMatch: null, viewsPerYear: null })
  })

  it('refuses an inconsistent row before writing anything', async () => {
    const bad = [
      exposure({ wikidataId: 'not-a-qid' }),
      exposure({ viewsPerYear: -5 }),
      exposure({ wikidataId: null, match: null }),
      exposure({ match: null }),
      exposure({ viewsWindow: '2023-2026' }),
    ]
    for (const row of bad) await expect(importExposure(db, 'rugby', [row])).rejects.toThrow(ValidationError)
    expect(mockedRepo.applyFameDetails).not.toHaveBeenCalled()
  })
})
