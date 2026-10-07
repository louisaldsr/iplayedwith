import { test as base, expect, Page, Route } from '@playwright/test'

/**
 * The e2e `test`, with every API call the browser makes mocked.
 *
 * Each test starts with a guard on `/api/**` that answers 500 and records the call; a test mocks
 * the endpoints it expects with `mockApi`, which takes precedence (Playwright matches the most
 * recently added route first). After the test, any call that reached the guard fails it — so a
 * page that starts calling a new endpoint is caught here, instead of silently hitting the server.
 *
 * Four endpoints are mocked by default: `/api/visitor`, the name the menu shows (asked only by a
 * registered visitor — see `asRegisteredVisitor`);
 * `/api/:sport/daily/stats` and `/api/:sport/daily/ranking` (both empty), which the results and the
 * finished screen show; and `/api/:sport/daily/solution`, refused (403) as for a day the server
 * never saw finished. Any test can reach them, and none should have to care; a test about one mocks
 * it again (its route wins).
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
        (route) => fulfillVisitorName(route, sampleVisitorName),
      )
      await page.route(
        (url) => /^\/api\/[^/]+\/daily\/stats$/.test(url.pathname),
        (route) => route.fulfill({ json: emptyDailyStats }),
      )
      await page.route(
        (url) => /^\/api\/[^/]+\/daily\/ranking$/.test(url.pathname),
        (route) => route.fulfill({ json: emptyDailyLeaderboard() }),
      )
      await page.route(
        (url) => /^\/api\/[^/]+\/daily\/solution$/.test(url.pathname),
        (route) => route.fulfill({ status: 403, json: { error: 'not over for this visitor' } }),
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

/**
 * Answers `POST /api/visitor` — or the first `POST /api/:sport/daily/start` — as the server does: the
 * name, and for a registered visitor the visitor cookie for the id sent (`src/lib/visitorCookie.ts`) —
 * without it, the menu would ask for the name again on every page.
 */
export function fulfillVisitorName(route: Route, body: { username: string | null }): Promise<void> {
  const { visitorId } = (route.request().postDataJSON() ?? {}) as { visitorId?: string }
  const headers: Record<string, string> =
    visitorId && body.username ? { 'set-cookie': `ipw_vid=${visitorId}; Path=/; Max-Age=34560000` } : {}
  return route.fulfill({ json: body, headers })
}

/** Starts the page as a returning visitor, so the first-visit rules pop-up (modal) stays closed. */
export async function asReturningVisitor(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem('ipw.rulesSeen', '999'))
}

/** The id `asRegisteredVisitor` plays under. */
export const registeredVisitorId = '3f2b8c1e-9a4d-4e7f-8b2c-1d5e6f7a8b9c'

/**
 * A returning visitor who has already started a daily — so the server registered it, named
 * "Hasty Prop 042": its id, its cached name and the visitor cookie, as the first Start left them. The
 * menu shows its badge at once, with no request. A visitor who never played has no name at all.
 */
export async function asRegisteredVisitor(page: Page): Promise<void> {
  await page.addInitScript(
    ({ id, username }) => {
      window.localStorage.setItem('ipw.rulesSeen', '999')
      // Once: a reload keeps what the page changed since (a rename).
      if (window.localStorage.getItem('ipw.playerId')) return
      window.localStorage.setItem('ipw.playerId', id)
      window.localStorage.setItem('ipw.name', JSON.stringify({ playerId: id, username }))
      document.cookie = `ipw_vid=${id}; path=/`
    },
    { id: registeredVisitorId, username: sampleVisitorName.username },
  )
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

/** The Paris day `days` before today. */
export const parisDaysAgo = (days: number) => {
  const date = new Date(`${parisToday()}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

/** A past day's pair — the sample pair again, so `winningMove` wins it too. */
export const pastDailyChallenge = { ...sampleDailyChallenge, day: parisDaysAgo(3), number: 4 }

/**
 * The rugby archive, newest first: today (never started), yesterday (lost on its day), two days ago
 * (won "+1", late), three days ago (never started).
 */
export const sampleDailyArchive = {
  today: parisToday(),
  days: [
    { ...sampleDailyChallenge, result: null },
    {
      ...sampleDailyChallenge,
      day: parisDaysAgo(1),
      number: 6,
      result: { outcome: 'lost', score: null, livesLost: 3, late: false },
    },
    {
      ...sampleDailyChallenge,
      day: parisDaysAgo(2),
      number: 5,
      result: { outcome: 'won', score: 1, livesLost: 0, late: true },
    },
    { ...pastDailyChallenge, result: null },
  ],
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

/** A day nobody has finished yet. A function: the day is read when the test runs. */
export const emptyDailyLeaderboard = () => ({ day: parisToday(), total: 0, podium: [], you: null })

/** Twelve finished: a podium with a tie for second, and the visitor 5th. */
export const sampleDailyLeaderboard = () => ({
  day: parisToday(),
  total: 12,
  podium: [
    { rank: 1, username: 'hasty:prop:042', score: 0, durationMs: 62_000, you: false },
    { rank: 2, username: 'Dupont', score: 1, durationMs: 45_000, you: false },
    { rank: 2, username: null, score: 1, durationMs: 80_000, you: false },
  ],
  you: { rank: 5, outcome: 'won', score: 2, durationMs: 130_000 },
})

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

/**
 * The day's stored solution for `sampleDailyChallenge`, in the board's shape:
 * Alpha — Club Un 2016-2017 — Charlie — Club Deux 2019-2020 — Bravo.
 */
export const sampleSolution = {
  path: ['p-alpha', 'p-charlie', 'p-bravo'],
  players: [samplePlayers[0], linkingPlayer, samplePlayers[1]],
  clubs: [sampleCareer.stints[0].club, sampleCareer.stints[1].club],
  edges: [
    { playerId: 'p-alpha', clubId: 'c-one', season: '2016-2017' },
    { playerId: 'p-charlie', clubId: 'c-one', season: '2016-2017' },
    { playerId: 'p-charlie', clubId: 'c-two', season: '2019-2020' },
    { playerId: 'p-bravo', clubId: 'c-two', season: '2019-2020' },
  ],
}
