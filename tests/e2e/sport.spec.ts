import { test, expect, mockApi, asReturningVisitor, samplePlayers, sampleDailyChallenge } from './fixtures'

// No database behind any of these: page requests are mocked (see fixtures.ts), and the `request`
// calls only reach answers the server gives before touching the database — unknown routes and
// input validation. What the database itself returns (search ranking, accent folding, the daily
// draw) is covered by the unit tests and the post-apply checks of each migration.

test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
})

test.describe('free-play setup screen', () => {
  for (const sport of ['rugby', 'football'] as const) {
    test(`${sport} setup screen renders without loading a dataset`, async ({ page }) => {
      await page.goto(`/${sport}/free`)
      await expect(page.getByPlaceholder('Search a player…').first()).toBeVisible()

      // The point of the server-side engine: the setup screen needs no data at all. Before, this
      // page pulled every player, club and membership for the sport. Any call would fail the
      // fixture's unmocked-API guard.
    })
  }

  test('player search is asked of the server, scoped to the sport', async ({ page }) => {
    const calls = await mockApi(page, '/api/players', samplePlayers)
    await page.goto('/rugby/free')

    await page.getByPlaceholder('Search a player…').first().fill('alp')

    await expect(page.getByText('Alpha Testeur')).toBeVisible()
    const last = calls.at(-1)!
    expect(last.searchParams.get('sport')).toBe('rugby')
    expect(last.searchParams.get('q')).toBe('alp')
  })

  test('the endpoint that shipped the whole graph is gone', async ({ request }) => {
    const res = await request.get('/api/memberships?sport=rugby')
    expect(res.status()).toBe(404)
  })

  test('listing players without a query is refused', async ({ request }) => {
    const res = await request.get('/api/players?sport=rugby')
    expect(res.status()).toBe(400)
  })
})

test.describe('daily challenge', () => {
  test("the sport page opens on the day's pair and links to free play", async ({ page }) => {
    await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
    await page.goto('/rugby')

    await expect(page.getByText('#7')).toBeVisible()
    await expect(page.getByText('Alpha Testeur')).toBeVisible()
    await expect(page.getByText('Bravo Éssai')).toBeVisible()
    await expect(page.getByText('3 links')).toBeVisible()
    await expect(page.locator('a[href="/rugby/free"]')).toBeVisible()
  })

  test('a failed load shows an error instead of an empty board', async ({ page }) => {
    await page.route('**/api/rugby/daily', (route) => route.fulfill({ status: 500, json: { error: 'down' } }))
    await page.goto('/rugby')

    await expect(page.getByText('Something went wrong')).toBeVisible()
  })

  test('an unknown sport is refused', async ({ request }) => {
    const res = await request.get('/api/basketball/daily')
    expect(res.status()).toBe(404)
  })
})
