import { SupabaseClient } from '@supabase/supabase-js'
import { ClubId, PlayerId } from '@/domain/ids'
import { Season } from '@/domain/season'
import * as membershipsRepo from '@/repositories/membershipsRepository'

/**
 * The property that matters here is what `games` does to a row that is ALREADY stored.
 *
 * An upsert updates exactly the columns present in its payload. So a row sent without the
 * `games` key keeps its stored count, and a row sent with `games: null` erases it. Mixing both
 * kinds in one payload would let PostgREST fill the missing key with NULL — hence one request
 * per kind, which is what these lock down.
 */
function recordingDb() {
  const payloads: Record<string, unknown>[][] = []
  const from = jest.fn(() => ({
    upsert: (payload: Record<string, unknown>[]) => {
      payloads.push(payload)
      return { select: () => Promise.resolve({ data: [], error: null }) }
    },
  }))
  return { db: { from } as unknown as SupabaseClient, payloads }
}

const row = (season: string, games?: number | null) => ({
  playerId: PlayerId('p1'),
  clubId: ClubId('c1'),
  season: season as Season,
  sport: 'rugby' as const,
  ...(games !== undefined && { games }),
})

describe('membershipsRepository.upsertMany', () => {
  it('writes games when the row carries them, including an explicit null', async () => {
    const { db, payloads } = recordingDb()

    await membershipsRepo.upsertMany(db, [row('2022-2023', 26), row('2021-2022', null)])

    expect(payloads).toHaveLength(1)
    expect(payloads[0].map((r) => r.games)).toEqual([26, null])
  })

  it('omits the games key entirely when the row does not carry it', async () => {
    const { db, payloads } = recordingDb()

    await membershipsRepo.upsertMany(db, [row('2022-2023')])

    expect(payloads).toHaveLength(1)
    expect(payloads[0][0]).not.toHaveProperty('games')
  })

  it('never mixes rows with and without games in one request', async () => {
    const { db, payloads } = recordingDb()

    await membershipsRepo.upsertMany(db, [row('2022-2023', 26), row('2021-2022'), row('2020-2021', 0)])

    expect(payloads).toHaveLength(2)
    for (const payload of payloads) {
      const withKey = payload.filter((r) => 'games' in r).length
      expect(withKey === 0 || withKey === payload.length).toBe(true)
    }
  })

  it('sends nothing for an empty batch', async () => {
    const { db, payloads } = recordingDb()

    await membershipsRepo.upsertMany(db, [])

    expect(payloads).toHaveLength(0)
  })
})
