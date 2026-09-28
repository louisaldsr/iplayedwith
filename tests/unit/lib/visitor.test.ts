import { markRulesSeen, readVisitor, RULES_VERSION } from '@/lib/visitor'

beforeEach(() => window.localStorage.clear())
afterEach(() => jest.restoreAllMocks())

describe('readVisitor', () => {
  it('reports a first visit and mints an anonymous id', () => {
    const visitor = readVisitor()

    expect(visitor.isFirstVisit).toBe(true)
    expect(visitor.playerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(visitor.rulesSeen).toBe(false)
  })

  it('recognises the same browser on the next visit, with the same id', () => {
    const first = readVisitor()
    const second = readVisitor()

    expect(second.isFirstVisit).toBe(false)
    expect(second.playerId).toBe(first.playerId)
  })
})

describe('rules seen', () => {
  it('is recorded by markRulesSeen', () => {
    markRulesSeen()
    expect(readVisitor().rulesSeen).toBe(true)
  })

  it('is reset by a newer rules version', () => {
    window.localStorage.setItem('ipw.rulesSeen', String(RULES_VERSION - 1))
    expect(readVisitor().rulesSeen).toBe(false)
  })
})

describe('when storage is unavailable', () => {
  it('reads as a returning visitor who has seen the rules, instead of throwing', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(readVisitor()).toEqual({ playerId: '', isFirstVisit: false, rulesSeen: true })
  })

  it('does not throw when the flag cannot be written', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    expect(() => markRulesSeen()).not.toThrow()
  })
})
