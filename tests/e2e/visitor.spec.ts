import { test, expect, mockApi, asReturningVisitor, sampleDailyChallenge, sampleVisitorName } from './fixtures'

// The name itself is drawn and kept unique by the database (018_visitor_number.sql); the menu
// only shows what the server gave, and remembers it.

const badge = (page: import('@playwright/test').Page) => page.locator('.visitor-badge')

test('the menu shows the visitor its name, asked of the server once and then remembered', async ({ page }) => {
  await asReturningVisitor(page)
  const asked: unknown[] = []
  await page.route(
    (url) => url.pathname === '/api/visitor',
    (route) => {
      asked.push(route.request().postDataJSON())
      return route.fulfill({ json: sampleVisitorName })
    },
  )

  await page.goto('/')
  await expect(badge(page)).toHaveText(/Hasty Prop 042/)
  await expect(page.getByText('Your name in the rankings: Hasty Prop 042')).toBeAttached()

  const playerId = await page.evaluate(() => window.localStorage.getItem('ipw.playerId'))
  expect(asked).toEqual([{ visitorId: playerId }])

  // Next visit: straight from the browser, no request.
  await page.reload()
  await expect(badge(page)).toHaveText(/Hasty Prop 042/)
  expect(asked).toHaveLength(1)
})

test('without an answer from the server, the menu simply has no badge', async ({ page }) => {
  await asReturningVisitor(page)
  await page.route(
    (url) => url.pathname === '/api/visitor',
    (route) => route.fulfill({ status: 500, json: { error: 'down' } }),
  )

  await page.goto('/')
  await expect(page.getByRole('link', { name: /Rugby — Daily challenge/ })).toBeVisible()
  await expect(badge(page)).toHaveCount(0)
})

test('during a game the name stays in view, in the top bar', async ({ page }) => {
  await asReturningVisitor(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/rugby/daily/start', {})

  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()

  await expect(page.locator('.game-topbar__visitor')).toHaveText(/Hasty Prop 042/)
  await expect(badge(page)).toHaveCount(0)
})

test('a visitor id that is not a UUID is refused before any database access', async ({ request }) => {
  const res = await request.post('/api/visitor', { data: { visitorId: 'me' } })
  expect(res.status()).toBe(400)
})
