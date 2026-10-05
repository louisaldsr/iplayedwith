import { SupabaseClient } from '@supabase/supabase-js'
import * as playersRepo from '@/repositories/playersRepository'
import { PlayerId } from '@/domain/ids'

/**
 * A PostgREST query builder: every filter returns the builder, and awaiting it resolves the
 * next queued response — first the count, then each pick. Records every call.
 */
function dbAnswering(...responses: unknown[]) {
  const calls: [string, unknown[]][] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args])
      return builder
    }
  }
  builder.then = (resolve: (value: unknown) => void) => resolve(responses.shift())
  const from = jest.fn(() => builder)
  return { db: { from } as unknown as SupabaseClient, from, calls }
}

const row = (id: string, name: string) => ({
  data: [{ players: { id, name, sport: 'rugby', nationality: 'NZ' } }],
  error: null,
})

afterEach(() => jest.restoreAllMocks())

describe('playersRepository.findRandomInFameBand', () => {
  it('picks by offset among the players whose score lies in the band', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    const { db, from, calls } = dbAnswering({ count: 10, error: null }, row('p5', "Richie Mo'unga"))

    const player = await playersRepo.findRandomInFameBand(db, 'rugby', { min: 60, max: 80 })

    expect(from).toHaveBeenCalledWith('player_fame')
    expect(calls).toContainEqual(['gte', ['score', 60]])
    expect(calls).toContainEqual(['lte', ['score', 80]])
    expect(calls).toContainEqual(['range', [5, 5]])
    expect(player).toEqual({ id: 'p5', name: "Richie Mo'unga", sport: 'rugby', nationality: 'NZ' })
  })

  it('steps to the next row when it lands on the excluded player', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.95)
    const { db, calls } = dbAnswering({ count: 10, error: null }, row('p9', 'Beauden Barrett'), row('p0', 'Ben Smith'))

    const player = await playersRepo.findRandomInFameBand(db, 'rugby', { min: 60, max: 80 }, PlayerId('p9'))

    expect(calls.filter(([m]) => m === 'range').map(([, args]) => args)).toEqual([
      [9, 9],
      [0, 0],
    ])
    expect(player?.id).toBe('p0')
  })

  // One player cannot fill both slots: the caller falls back to the whole sport instead.
  it.each([0, 1, null])('returns null when the band holds %p player(s)', async (count) => {
    const { db, calls } = dbAnswering({ count, error: null })

    expect(await playersRepo.findRandomInFameBand(db, 'rugby', { min: 60, max: 80 })).toBeNull()
    expect(calls.some(([m]) => m === 'range')).toBe(false)
  })

  it('throws on a query error', async () => {
    const { db } = dbAnswering({ count: null, error: { message: 'relation does not exist' } })

    await expect(playersRepo.findRandomInFameBand(db, 'rugby', { min: 60, max: 80 })).rejects.toThrow(
      'relation does not exist',
    )
  })
})
