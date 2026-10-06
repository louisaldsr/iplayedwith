import { getOrGenerate } from '@/repositories/dailyChallengesRepository'
import { getDailyChallenge } from '@/services/dailyChallengeService'
import * as playersRepo from '@/repositories/playersRepository'
import { ChallengeDay } from '@/domain/dailyChallenge'
import { PlayerId } from '@/domain/ids'

jest.mock('@/repositories/playersRepository')

// `generate_daily_challenge` returns the whole stored row — the solution included. It must stop at
// the repository: what `/api/:sport/daily` sends a browser before the day is over carries nothing
// of it. The only way to the solution is `findSolution`, behind the visitor's recorded outcome.

const row = {
  sport: 'rugby',
  day: '2026-10-06',
  number: 3,
  player_a_id: 'p-a',
  player_b_id: 'p-b',
  optimal_links: 2,
  solution: ['p-a', 'p-secret', 'p-b'],
}
const db = { rpc: jest.fn().mockResolvedValue({ data: row, error: null }) } as never

describe("the day's solution before the end", () => {
  it('is dropped by the repository', async () => {
    const stored = await getOrGenerate(db, 'rugby', ChallengeDay('2026-10-06'))
    expect(JSON.stringify(stored)).not.toContain('p-secret')
  })

  it("is not in the challenge the API sends — the day's pair and its length only", async () => {
    jest.mocked(playersRepo.findManyByIds).mockResolvedValue([
      { id: PlayerId('p-a'), name: 'A', sport: 'rugby' },
      { id: PlayerId('p-b'), name: 'B', sport: 'rugby' },
    ])
    const challenge = await getDailyChallenge(db, 'rugby', new Date('2026-10-06T10:00:00Z'))
    expect(Object.keys(challenge).sort()).toEqual(['day', 'number', 'optimalLinks', 'playerA', 'playerB', 'sport'])
    expect(JSON.stringify(challenge)).not.toContain('p-secret')
  })
})
