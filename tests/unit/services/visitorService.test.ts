import { ensureUsername, renameVisitor } from '@/services/visitorService'
import * as visitorsRepo from '@/repositories/visitorsRepository'
import { VisitorId } from '@/domain/dailyResult'
import { NAME_ADJECTIVES, NAME_NOUNS } from '@/domain/visitorName'

jest.mock('@/repositories/visitorsRepository')

const db = {} as never
const repo = jest.mocked(visitorsRepo)
const id = '6f1c2b1e-8a5d-4c1b-9d3e-2f7a1b0c9e11' as VisitorId

afterEach(() => jest.resetAllMocks())

describe('ensureUsername', () => {
  it("returns the database's username for the visitor, drawing all three parts", async () => {
    repo.ensure.mockResolvedValue('hasty:prop:042')

    await expect(ensureUsername(db, id, () => 0)).resolves.toBe('hasty:prop:042')
    expect(repo.ensure).toHaveBeenCalledWith(db, id, `${NAME_ADJECTIVES[0]}:${NAME_NOUNS[0]}:000`)
  })

  it('draws all three parts again when the name is taken', async () => {
    const draws = [0, 0, 0, 0.5, 0.5, 0.5]
    repo.ensure.mockRejectedValueOnce(new Error('duplicate key')).mockResolvedValueOnce('x')

    await ensureUsername(db, id, () => draws.shift()!)

    const [first, second] = repo.ensure.mock.calls.map(([, , username]) => username.split(':'))
    expect(second.every((part, i) => part !== first[i])).toBe(true)
  })

  it('gives up after a few draws', async () => {
    repo.ensure.mockRejectedValue(new Error('database down'))

    await expect(ensureUsername(db, id)).rejects.toThrow('database down')
    expect(repo.ensure).toHaveBeenCalledTimes(5)
  })
})

describe('renameVisitor', () => {
  it('stores the name as validated — trimmed', async () => {
    repo.rename.mockResolvedValue('renamed')

    await expect(renameVisitor(db, id, '  Jean  Dupont ')).resolves.toEqual({
      status: 'renamed',
      username: 'Jean Dupont',
    })
    expect(repo.rename).toHaveBeenCalledWith(db, id, 'Jean Dupont')
  })

  it('refuses an invalid name without reaching the database', async () => {
    await expect(renameVisitor(db, id, 'a:b:c')).resolves.toEqual({ status: 'invalid', problem: 'characters' })
    expect(repo.rename).not.toHaveBeenCalled()
  })

  it('offers up to 3 free variants when the name is taken', async () => {
    repo.rename.mockResolvedValue('taken')
    repo.freeAmong.mockImplementation(async (_db, candidates) => candidates.slice(1))

    const result = await renameVisitor(db, id, 'Dupont')

    expect(result.status).toBe('taken')
    const { suggestions } = result as { suggestions: string[] }
    expect(suggestions).toHaveLength(3)
    for (const s of suggestions) expect(s).toMatch(/^Dupont\d+$/)
    const [, candidates] = repo.freeAmong.mock.calls[0]
    expect(candidates.slice(1, 4)).toEqual(suggestions)
  })

  // The suggestions are a nicety: the visitor still learns the name is taken.
  it('still answers "taken" when the suggestions cannot be looked up', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    repo.rename.mockResolvedValue('taken')
    repo.freeAmong.mockRejectedValue(new Error('database down'))

    await expect(renameVisitor(db, id, 'Dupont')).resolves.toEqual({ status: 'taken', suggestions: [] })
  })

  it('is a 404 for a visitor the server never saw', async () => {
    repo.rename.mockResolvedValue('unknown')

    await expect(renameVisitor(db, id, 'Dupont')).rejects.toMatchObject({ status: 404 })
  })
})
