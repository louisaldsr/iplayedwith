import { hasVisitorCookie, markRulesSeen, readVisitor, RULES_VERSION } from '@/lib/visitor'

const ID = '3f2b8c1e-9a4d-4e7f-8b2c-1d5e6f7a8b9c'

beforeEach(() => {
  window.localStorage.clear()
  document.cookie = 'ipw_vid=; max-age=0'
})
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

describe('the visitor cookie', () => {
  it('brings the id back when storage was purged (Safari, after a week away) — not a first visit', () => {
    document.cookie = `ipw_vid=${ID}`

    const visitor = readVisitor()

    expect(visitor).toMatchObject({ playerId: ID, isFirstVisit: false })
    expect(window.localStorage.getItem('ipw.playerId')).toBe(ID)
  })

  it('never overrides the id in storage', () => {
    window.localStorage.setItem('ipw.playerId', 'from-storage')
    document.cookie = `ipw_vid=${ID}`

    expect(readVisitor().playerId).toBe('from-storage')
  })

  it('a cookie that is not a UUID is ignored: a new id is minted', () => {
    document.cookie = 'ipw_vid=forged'

    const visitor = readVisitor()

    expect(visitor.isFirstVisit).toBe(true)
    expect(visitor.playerId).not.toBe('forged')
  })

  it('hasVisitorCookie tells whether the server has set it, for this id', () => {
    expect(hasVisitorCookie(ID)).toBe(false)
    document.cookie = `ipw_vid=${ID}`
    expect(hasVisitorCookie(ID)).toBe(true)
    expect(hasVisitorCookie('another')).toBe(false)
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
