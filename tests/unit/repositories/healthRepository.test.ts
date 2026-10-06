/**
 * @jest-environment node
 */
// Server code: AbortSignal.timeout exists in Node, not in jsdom.
import { ping } from '@/repositories/healthRepository'

function fakeDb(result: { error: { message: string } | null }) {
  const chain = { select: jest.fn(), limit: jest.fn(), abortSignal: jest.fn().mockResolvedValue(result) }
  chain.select.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  return { db: { from: jest.fn().mockReturnValue(chain) } as never, chain }
}

describe('ping', () => {
  it('reads one row, with a timeout', async () => {
    const { db, chain } = fakeDb({ error: null })
    await expect(ping(db)).resolves.toBeUndefined()
    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(chain.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('throws when the database does not answer', async () => {
    const { db } = fakeDb({ error: { message: 'fetch failed' } })
    await expect(ping(db)).rejects.toThrow('fetch failed')
  })
})
