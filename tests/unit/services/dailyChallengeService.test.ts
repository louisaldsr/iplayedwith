import { getDailyArchive, getDailyChallenge } from '@/services/dailyChallengeService'
import * as dailyChallengesRepo from '@/repositories/dailyChallengesRepository'
import * as dailyResultsRepo from '@/repositories/dailyResultsRepository'
import * as playersRepo from '@/repositories/playersRepository'
import { VisitorId } from '@/domain/dailyResult'
import { PlayerId } from '@/domain/ids'
import { ChallengeDay } from '@/domain/dailyChallenge'
import { NotFoundError } from '@/services/errors'

jest.mock('@/repositories/dailyChallengesRepository')
jest.mock('@/repositories/playersRepository')
jest.mock('@/repositories/dailyResultsRepository')

const db = {} as never
const mockedChallenges = jest.mocked(dailyChallengesRepo)
const mockedPlayers = jest.mocked(playersRepo)
const mockedResults = jest.mocked(dailyResultsRepo)

const dupont = { id: PlayerId('p-dupont'), name: 'Antoine Dupont', sport: 'rugby' as const }
const ntamack = { id: PlayerId('p-ntamack'), name: 'Romain Ntamack', sport: 'rugby' as const }

beforeEach(() => {
  mockedChallenges.getOrGenerate.mockResolvedValue({
    sport: 'rugby',
    day: ChallengeDay('2026-07-15'),
    number: 12,
    playerAId: dupont.id,
    playerBId: ntamack.id,
    optimalLinks: 3,
  })
})

afterEach(() => jest.clearAllMocks())

describe('getDailyChallenge', () => {
  it('asks for the Paris day, not the UTC one', async () => {
    mockedPlayers.findManyByIds.mockResolvedValue([dupont, ntamack])

    await getDailyChallenge(db, 'rugby', new Date('2026-07-14T22:30:00Z'))

    expect(mockedChallenges.getOrGenerate).toHaveBeenCalledWith(db, 'rugby', '2026-07-15')
  })

  it('resolves both players, in A/B order whatever order the repository returns them in', async () => {
    mockedPlayers.findManyByIds.mockResolvedValue([ntamack, dupont])

    const challenge = await getDailyChallenge(db, 'rugby', new Date('2026-07-15T10:00:00Z'))

    expect(challenge).toEqual({
      sport: 'rugby',
      day: '2026-07-15',
      number: 12,
      playerA: dupont,
      playerB: ntamack,
      optimalLinks: 3,
    })
  })

  it('exposes no solution', async () => {
    mockedPlayers.findManyByIds.mockResolvedValue([dupont, ntamack])

    const challenge = await getDailyChallenge(db, 'rugby')

    expect(Object.keys(challenge).sort()).toEqual(['day', 'number', 'optimalLinks', 'playerA', 'playerB', 'sport'])
  })

  it('is NotFound when a player of the stored pair is gone', async () => {
    mockedPlayers.findManyByIds.mockResolvedValue([dupont])

    await expect(getDailyChallenge(db, 'rugby')).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('getDailyArchive', () => {
  const visitorId = '6f1c2b1e-8a5d-4c1b-9d3e-2f7a1b0c9e11' as VisitorId
  const day = (d: string, number: number) => ({
    sport: 'rugby' as const,
    day: ChallengeDay(d),
    number,
    playerAId: dupont.id,
    playerBId: ntamack.id,
    optimalLinks: 2,
  })

  beforeEach(() => {
    mockedChallenges.listUpTo.mockResolvedValue([day('2026-07-15', 12), day('2026-07-14', 11), day('2026-07-13', 10)])
    mockedPlayers.findManyByIds.mockResolvedValue([dupont, ntamack])
  })

  it("lists up to today — the Paris day — never tomorrow's pair, already drawn", async () => {
    mockedResults.visitorDays.mockResolvedValue([])

    const archive = await getDailyArchive(db, 'rugby', visitorId, new Date('2026-07-14T22:30:00Z'))

    expect(mockedChallenges.listUpTo).toHaveBeenCalledWith(db, 'rugby', '2026-07-15')
    expect(archive.today).toBe('2026-07-15')
    expect(archive.days.map((d) => d.number)).toEqual([12, 11, 10])
  })

  it("puts the visitor's result on each day it has one — late ones marked", async () => {
    mockedResults.visitorDays.mockResolvedValue([
      { day: ChallengeDay('2026-07-13'), outcome: 'won', score: 1, livesLost: 1, late: true },
      { day: ChallengeDay('2026-07-15'), outcome: null, score: null, livesLost: 2, late: false },
    ])

    const archive = await getDailyArchive(db, 'rugby', visitorId, new Date('2026-07-15T10:00:00Z'))

    expect(archive.days.map((d) => d.result)).toEqual([
      { outcome: null, score: null, livesLost: 2, late: false },
      null,
      { outcome: 'won', score: 1, livesLost: 1, late: true },
    ])
    expect(archive.days[0]).toMatchObject({ playerA: dupont, playerB: ntamack, optimalLinks: 2 })
  })

  it('lists the days alone without a visitor', async () => {
    const archive = await getDailyArchive(db, 'rugby', null, new Date('2026-07-15T10:00:00Z'))

    expect(mockedResults.visitorDays).not.toHaveBeenCalled()
    expect(archive.days.every((d) => d.result === null)).toBe(true)
  })

  it('looks the players up in batches — a long archive stays under URL limits', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      ...day('2026-07-15', 200 - i),
      playerAId: PlayerId(`p-a${i}`),
      playerBId: PlayerId(`p-b${i}`),
    }))
    mockedChallenges.listUpTo.mockResolvedValue(many)
    mockedPlayers.findManyByIds.mockImplementation(async (_db, ids) =>
      ids.map((id) => ({ id, name: id, sport: 'rugby' as const })),
    )

    const archive = await getDailyArchive(db, 'rugby', null, new Date('2026-07-15T10:00:00Z'))

    expect(archive.days).toHaveLength(200)
    expect(mockedPlayers.findManyByIds).toHaveBeenCalledTimes(3) // 400 players, 150 a batch
    expect(Math.max(...mockedPlayers.findManyByIds.mock.calls.map(([, ids]) => ids.length))).toBe(150)
  })
})
