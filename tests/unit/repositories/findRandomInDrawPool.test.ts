import { SupabaseClient } from '@supabase/supabase-js'
import * as playersRepo from '@/repositories/playersRepository'
import { PlayerId } from '@/domain/ids'

/** The pool, the sliding scale and the exclusion live in `random_pool_player` (032_draw_pool.sql). */
function dbReturning(data: unknown[] | null, error?: { message: string }) {
  const rpc = jest.fn().mockResolvedValue({ data, error: error ?? null })
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}

describe('playersRepository.findRandomInDrawPool', () => {
  it('asks random_pool_player for a pool player, with no partner', async () => {
    const { db, rpc } = dbReturning([{ id: 'p5', name: 'James Hunt', sport: 'formula1', nationality: null }])

    const player = await playersRepo.findRandomInDrawPool(db, 'formula1')

    expect(rpc).toHaveBeenCalledWith('random_pool_player', { p_sport: 'formula1', p_partner: null })
    expect(player).toEqual({ id: 'p5', name: 'James Hunt', sport: 'formula1', nationality: undefined })
  })

  it('passes the player in the other slot as the partner', async () => {
    const { db, rpc } = dbReturning([{ id: 'p5', name: 'James Hunt', sport: 'formula1', nationality: null }])

    await playersRepo.findRandomInDrawPool(db, 'formula1', PlayerId('p1'))

    expect(rpc).toHaveBeenCalledWith('random_pool_player', { p_sport: 'formula1', p_partner: 'p1' })
  })

  // No settings row or no scores yet: the caller falls back to the whole sport.
  it.each([[[]], [null]])('returns null when the pool is empty (%p)', async (data) => {
    const { db } = dbReturning(data)

    expect(await playersRepo.findRandomInDrawPool(db, 'formula1')).toBeNull()
  })

  it('throws on an RPC error', async () => {
    const { db } = dbReturning(null, { message: 'function does not exist' })

    await expect(playersRepo.findRandomInDrawPool(db, 'formula1')).rejects.toThrow('function does not exist')
  })
})
