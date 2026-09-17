import { SupabaseClient } from '@supabase/supabase-js'
import * as clubsRepo from '@/repositories/clubsRepository'
import * as playersRepo from '@/repositories/playersRepository'

/**
 * These two are the only `.rpc()` callers in the codebase, so what matters is the
 * contract with the SQL functions in 008_search_normalization.sql: the parameter names,
 * the 20-row cap, and the snake_case → camelCase mapping of the returned rows.
 */
function dbReturning(data: unknown[] | null, error?: { message: string }) {
  const rpc = jest.fn().mockResolvedValue({ data, error: error ?? null })
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}

describe('playersRepository.searchBySport', () => {
  it('calls search_players with the sport, the raw query and the 20-row cap', async () => {
    const { db, rpc } = dbReturning([{ id: 'p1', name: 'Gaël Fickou', sport: 'rugby', nationality: 'FR' }])

    const result = await playersRepo.searchBySport(db, 'rugby', 'gael fickou')

    expect(rpc).toHaveBeenCalledWith('search_players', {
      p_sport: 'rugby',
      p_q: 'gael fickou',
      p_limit: 20,
    })
    expect(result).toEqual([{ id: 'p1', name: 'Gaël Fickou', sport: 'rugby', nationality: 'FR' }])
  })

  it('maps a null nationality to undefined', async () => {
    const { db } = dbReturning([{ id: 'p1', name: 'Dupont', sport: 'rugby', nationality: null }])

    const [player] = await playersRepo.searchBySport(db, 'rugby', 'dup')

    expect(player.nationality).toBeUndefined()
  })

  it('throws on an RPC error rather than returning an empty list', async () => {
    const { db } = dbReturning(null, { message: 'function does not exist' })

    await expect(playersRepo.searchBySport(db, 'rugby', 'dup')).rejects.toThrow('function does not exist')
  })
})

describe('clubsRepository.searchBySport', () => {
  it('surfaces the alias a club was found through', async () => {
    const { db, rpc } = dbReturning([
      { id: 'c1', name: 'Stade Rochelais', sport: 'rugby', logo_url: null, matched_alias: 'La Rochelle' },
    ])

    const [club] = await clubsRepo.searchBySport(db, 'rugby', 'la roch')

    expect(rpc).toHaveBeenCalledWith('search_clubs', { p_sport: 'rugby', p_q: 'la roch', p_limit: 20 })
    expect(club.name).toBe('Stade Rochelais')
    expect(club.matchedAlias).toBe('La Rochelle')
  })

  // NULL means the official name is what matched, so there is no alias worth showing.
  it('leaves matchedAlias undefined when the club name itself matched', async () => {
    const { db } = dbReturning([
      { id: 'c1', name: 'Stade Toulousain', sport: 'rugby', logo_url: 'x.png', matched_alias: null },
    ])

    const [club] = await clubsRepo.searchBySport(db, 'rugby', 'toulousain')

    expect(club.matchedAlias).toBeUndefined()
    expect(club.logoUrl).toBe('x.png')
  })

  it('returns an empty list when the function returns no rows', async () => {
    const { db } = dbReturning([])

    expect(await clubsRepo.searchBySport(db, 'rugby', 'zzz')).toEqual([])
  })
})
