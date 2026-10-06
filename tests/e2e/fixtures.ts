import { test as base, expect, Page } from '@playwright/test'

/**
 * The e2e `test`, with every API call the browser makes mocked.
 *
 * Each test starts with a guard on `/api/**` that answers 500 and records the call; a test mocks
 * the endpoints it expects with `mockApi`, which takes precedence (Playwright matches the most
 * recently added route first). After the test, any call that reached the guard fails it — so a
 * page that starts calling a new endpoint is caught here, instead of silently hitting the server.
 *
 * Two endpoints are mocked by default: `/api/visitor`, the name the menu shows, and
 * `/api/:sport/daily/stats` (empty), which the results and the finished screen show. Any test can
 * reach them, and none should have to care; a test about either mocks it again (its route wins).
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
      await page.route(
        (url) => url.pathname === '/api/visitor',
        (route) => route.fulfill({ json: sampleVisitorName }),
      )
      await page.route(
        (url) => /^\/api\/[^/]+\/daily\/stats$/.test(url.pathname),
        (route) => route.fulfill({ json: emptyDailyStats }),
      )
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

/** "Hasty Prop 042" in English. */
export const sampleVisitorName = { username: 'hasty:prop:042' }
// Invented players: the tests must not depend on anything a re-seed could change.

export const samplePlayers = [
  { id: 'p-alpha', name: 'Alpha Testeur', sport: 'rugby', nationality: 'FR' },
  { id: 'p-bravo', name: 'Bravo Éssai', sport: 'rugby' },
]

/** Today in Paris, as the server would date the challenge — winning it must count as "today". */
export const parisToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

/** One player needed: `winningMove` wins it with that one — "Perfect!". */
export const sampleDailyChallenge = {
  sport: 'rugby',
  day: parisToday(),
  number: 7,
  playerA: samplePlayers[0],
  playerB: samplePlayers[1],
  optimalLinks: 2,
}

/** A visitor who never finished a daily. */
export const emptyDailyStats = {
  played: 0,
  won: 0,
  currentStreak: 0,
  bestStreak: 0,
  averageScore: null,
  distribution: [0, 0, 0, 0, 0, 0],
  lost: 0,
  today: null,
}

/** Four days: won Perfect twice (today included) and at +2, lost once. */
export const sampleDailyStats = {
  played: 4,
  won: 3,
  currentStreak: 2,
  bestStreak: 2,
  averageScore: 0.6666666666666666,
  distribution: [2, 0, 1, 0, 0, 0],
  lost: 1,
  today: 0,
}

export const sampleCareer = {
  player: samplePlayers[0],
  stints: [
    {
      club: { id: 'c-one', name: 'Club Un', sport: 'rugby' },
      from: '2015-2016',
      to: '2018-2019',
      games: 64,
    },
    { club: { id: 'c-two', name: 'Club Deux', sport: 'rugby' }, from: '2019-2020', to: '2019-2020', games: null },
  ],
}

/** A player linking Alpha and Bravo: the one move that wins the sample challenge. */
export const linkingPlayer = { id: 'p-charlie', name: 'Charlie Lien', sport: 'rugby' }

export const winningMove = {
  ok: true,
  node: { kind: 'player', player: linkingPlayer },
  edges: [
    { playerId: 'p-charlie', clubId: 'c-one', season: '2016-2017' },
    { playerId: 'p-alpha', clubId: 'c-one', season: '2016-2017' },
    { playerId: 'p-charlie', clubId: 'c-two', season: '2019-2020' },
    { playerId: 'p-bravo', clubId: 'c-two', season: '2019-2020' },
  ],
  clubs: [sampleCareer.stints[0].club, sampleCareer.stints[1].club],
  victory: true,
  path: ['p-alpha', 'p-charlie', 'p-bravo'],
}

/** A guess that connects to nobody on the board — the only rejection that costs a daily life. */
export const notConnectedMove = {
  ok: false,
  code: 'not-connected',
  reason: 'Ce joueur ne partage aucun club/saison avec les joueurs déjà dans le graphe.',
}
