import { ensureVisitorName } from '@/services/visitorService'
import * as visitorsRepo from '@/repositories/visitorsRepository'
import { VisitorId } from '@/domain/dailyResult'
import { NAME_ADJECTIVES, NAME_NOUNS } from '@/domain/visitorName'

jest.mock('@/repositories/visitorsRepository')

const db = {} as never
const repo = jest.mocked(visitorsRepo)
const id = '6f1c2b1e-8a5d-4c1b-9d3e-2f7a1b0c9e11' as VisitorId
const name = { adjective: 'hasty' as const, noun: 'prop' as const, number: 42 }

afterEach(() => jest.resetAllMocks())

describe('ensureVisitorName', () => {
  it("returns the database's name for the visitor, drawing words from the lists", async () => {
    repo.ensure.mockResolvedValue(name)

    await expect(ensureVisitorName(db, id, () => 0)).resolves.toEqual(name)
    expect(repo.ensure).toHaveBeenCalledWith(db, id, { adjective: NAME_ADJECTIVES[0], noun: NAME_NOUNS[0] })
  })

  it('draws again when the pair is full or the number was just taken', async () => {
    repo.ensure.mockRejectedValueOnce(new Error('no free number left')).mockResolvedValueOnce(name)

    await expect(ensureVisitorName(db, id)).resolves.toEqual(name)
    expect(repo.ensure).toHaveBeenCalledTimes(2)
  })

  it('gives up after a few draws', async () => {
    repo.ensure.mockRejectedValue(new Error('database down'))

    await expect(ensureVisitorName(db, id)).rejects.toThrow('database down')
    expect(repo.ensure).toHaveBeenCalledTimes(5)
  })
})
