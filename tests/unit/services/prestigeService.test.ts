import { importClubTitles, importContinentalWins } from '@/services/prestigeService'
import * as prestigeRepo from '@/repositories/prestigeRepository'
import { ValidationError } from '@/services/errors'

jest.mock('@/repositories/prestigeRepository')

const db = {} as never
const mockedRepo = jest.mocked(prestigeRepo)

beforeEach(() => {
  mockedRepo.replaceContinentalWins.mockResolvedValue(0)
  mockedRepo.replaceClubTitles.mockResolvedValue(0)
})
afterEach(() => jest.clearAllMocks())

describe('importContinentalWins', () => {
  const run = (clubId: string, season: string, wins: Record<string, number>) => ({ clubId, season, wins })

  it('replaces the whole sport in one call and reports how many rows landed', async () => {
    mockedRepo.replaceContinentalWins.mockResolvedValue(2)

    await expect(
      importContinentalWins(db, 'rugby', [
        run('toulouse', '2023-2024', { 'Champions Cup': 8 }),
        run('leinster', '2023-2024', { 'Champions Cup': 8 }),
      ]),
    ).resolves.toEqual({ written: 2 })
    expect(mockedRepo.replaceContinentalWins).toHaveBeenCalledTimes(1)
  })

  it('drops zero counts, which the SQL would read as no run anyway', async () => {
    await importContinentalWins(db, 'football', [run('c1', '2016-2017', { 'Champions League': 0, 'Europa League': 9 })])

    const [, , rows] = mockedRepo.replaceContinentalWins.mock.calls[0]
    expect(rows[0].wins).toEqual({ 'Europa League': 9 })
  })

  it('refuses a club-season listed twice rather than letting the last one win', async () => {
    // Two rows would mean the club matched twice under two names: a bug to see, not to merge.
    await expect(
      importContinentalWins(db, 'rugby', [
        run('toulouse', '2023-2024', { 'Champions Cup': 8 }),
        run('toulouse', '2023-2024', { 'Challenge Cup': 2 }),
      ]),
    ).rejects.toThrow(/twice/)
    expect(mockedRepo.replaceContinentalWins).not.toHaveBeenCalled()
  })

  it('writes nothing when any row is invalid', async () => {
    await expect(
      importContinentalWins(db, 'rugby', [
        run('toulouse', '2023-2024', { 'Champions Cup': 8 }),
        run('leinster', '2023-2024', { 'Champions Cup': -1 }),
      ]),
    ).rejects.toThrow(ValidationError)
    expect(mockedRepo.replaceContinentalWins).not.toHaveBeenCalled()
  })

  it('rejects an implausible run, and accepts the longest real one', async () => {
    await expect(importContinentalWins(db, 'rugby', [run('c1', '2016-2017', { 'Super Rugby': 90 })])).rejects.toThrow(
      /implausible/,
    )
    // The Crusaders' 2017: 17 Super Rugby wins.
    await expect(
      importContinentalWins(db, 'rugby', [run('c1', '2016-2017', { 'Super Rugby': 17 })]),
    ).resolves.toBeDefined()
  })

  it('rejects a malformed season, a fractional count and a missing club', async () => {
    await expect(importContinentalWins(db, 'rugby', [run('c1', '23/24', { 'Champions Cup': 8 })])).rejects.toThrow(
      /invalid season/,
    )
    await expect(
      importContinentalWins(db, 'rugby', [run('c1', '2023-2024', { 'Champions Cup': 2.5 })]),
    ).rejects.toThrow(/whole number/)
    await expect(importContinentalWins(db, 'rugby', [run('', '2023-2024', { 'Champions Cup': 8 })])).rejects.toThrow(
      /clubId/,
    )
  })

  it('still calls the replace with no rows: an import that finds no run must clear the old ones', async () => {
    await importContinentalWins(db, 'rugby', [])
    expect(mockedRepo.replaceContinentalWins).toHaveBeenCalledWith(db, 'rugby', [])
  })
})

describe('importClubTitles', () => {
  const title = (clubId: string, season: string, competition: string) => ({ clubId, season, competition })

  it('replaces the titles of its own source', async () => {
    mockedRepo.replaceClubTitles.mockResolvedValue(1)

    await expect(
      importClubTitles(db, 'football', 'transfermarkt', [title('real', '2016-2017', 'Champions League')]),
    ).resolves.toEqual({ written: 1 })
    expect(mockedRepo.replaceClubTitles).toHaveBeenCalledWith(db, 'football', 'transfermarkt', [
      { clubId: 'real', season: '2016-2017', competition: 'Champions League' },
    ])
  })

  it('refuses two winners for one competition-season before deleting anything', async () => {
    await expect(
      importClubTitles(db, 'football', 'transfermarkt', [
        title('real', '2016-2017', 'Champions League'),
        title('juve', '2016-2017', 'Champions League'),
      ]),
    ).rejects.toThrow(/two winners/)
    expect(mockedRepo.replaceClubTitles).not.toHaveBeenCalled()
  })

  it('keeps a title listed twice with the same winner once', async () => {
    await importClubTitles(db, 'football', 'transfermarkt', [
      title('real', '2016-2017', 'Champions League'),
      title('real', '2016-2017', 'Champions League'),
    ])
    const [, , , rows] = mockedRepo.replaceClubTitles.mock.calls[0]
    expect(rows).toHaveLength(1)
  })

  it('requires a source, so a writer can never replace the curated seed', async () => {
    await expect(importClubTitles(db, 'rugby', ' ', [])).rejects.toThrow(/source/)
  })
})
