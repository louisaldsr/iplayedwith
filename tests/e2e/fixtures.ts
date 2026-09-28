import { test as base, expect, Page } from '@playwright/test'

/**
 * The e2e `test`, with every API call the browser makes mocked.
 *
 * Each test starts with a guard on `/api/**` that answers 500 and records the call; a test mocks
 * the endpoints it expects with `mockApi`, which takes precedence (Playwright matches the most
 * recently added route first). After the test, any call that reached the guard fails it — so a
 * page that starts calling a new endpoint is caught here, instead of silently hitting the server.
 *
 * The server side is covered separately: the e2e dev server has no real database to reach (see
 * playwright.config.ts). Only requests the server answers WITHOUT the database — input
 * validation, unknown routes — are exercised through the `request` fixture.
 */
export const test = base.extend<{ unmockedApiCalls: string[] }>({
  unmockedApiCalls: [
    async ({ page }, use) => {
      const calls: string[] = []
      await page.route('**/api/**', (route) => {
        calls.push(`${route.request().method()} ${route.request().url()}`)
        return route.fulfill({ status: 500, json: { error: 'unmocked API call in an e2e test' } })
      })
      await use(calls)
      expect(calls, 'API calls with no mock — add one with mockApi()').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Answers `GET <path>` (any query string) with `body`, and returns the URLs it was called with. */
export async function mockApi(page: Page, path: string, body: unknown): Promise<URL[]> {
  const calls: URL[] = []
  await page.route(
    (url) => url.pathname === path,
    (route) => {
      calls.push(new URL(route.request().url()))
      return route.fulfill({ json: body })
    },
  )
  return calls
}

/** Starts the page as a returning visitor, so the first-visit rules pop-up (modal) stays closed. */
export async function asReturningVisitor(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem('ipw.rulesSeen', '999'))
}

// ─── Sample data ──────────────────────────────────────────────────────────────
// Invented players: the tests must not depend on anything a re-seed could change.

export const samplePlayers = [
  { id: 'p-alpha', name: 'Alpha Testeur', sport: 'rugby' },
  { id: 'p-bravo', name: 'Bravo Éssai', sport: 'rugby' },
]

export const sampleDailyChallenge = {
  sport: 'rugby',
  day: '2026-10-01',
  number: 7,
  playerA: samplePlayers[0],
  playerB: samplePlayers[1],
  optimalLinks: 3,
}
