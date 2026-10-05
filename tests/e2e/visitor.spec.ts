import { test, expect, mockApi, asReturningVisitor, sampleDailyChallenge, sampleVisitorName } from './fixtures'

// The name itself is drawn by the server and kept unique by the database (020_visitor_username.sql); the menu
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

test('during a game the name stays in view, in the top bar — shown, not renamable', async ({ page }) => {
  await asReturningVisitor(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/rugby/daily/start', {})

  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()

  await expect(page.locator('.game-topbar__visitor')).toHaveText(/Hasty Prop 042/)
  await expect(badge(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Change your name/ })).toHaveCount(0)
})

test('a visitor id that is not a UUID is refused before any database access', async ({ request }) => {
  const res = await request.post('/api/visitor', { data: { visitorId: 'me' } })
  expect(res.status()).toBe(400)
})

// ─── Renaming, from the menu ──────────────────────────────────────────────────

/** Answers the rename (PATCH) with each response in turn; the name itself (POST) keeps its default mock. */
async function mockRename(page: import('@playwright/test').Page, ...responses: { status: number; json: unknown }[]) {
  const sent: unknown[] = []
  await page.route(
    (url) => url.pathname === '/api/visitor',
    (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      sent.push(route.request().postDataJSON())
      return route.fulfill(responses.shift() ?? { status: 500, json: {} })
    },
  )
  return sent
}

test('the visitor renames itself in place, from the menu badge, and keeps the new name', async ({ page }) => {
  await asReturningVisitor(page)
  const sent = await mockRename(page, { status: 200, json: { username: 'Le Grand Chelem' } })

  await page.goto('/')
  await page.getByRole('button', { name: /Change your name/ }).click()
  const field = badge(page).getByRole('textbox', { name: 'New name' })
  await expect(field).toHaveValue('Hasty Prop 042')
  await expect(field).toBeFocused()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Selected on opening: typing replaces the name.
  await page.keyboard.type('  Le Grand   Chelem ')
  await page.keyboard.press('Enter')

  await expect(field).toBeHidden()
  await expect(badge(page)).toHaveText(/Le Grand Chelem/)
  await expect(page.getByRole('button', { name: /Change your name/ })).toBeFocused()
  const playerId = await page.evaluate(() => window.localStorage.getItem('ipw.playerId'))
  expect(sent).toEqual([{ visitorId: playerId, username: 'Le Grand Chelem' }])

  await page.reload()
  await expect(badge(page)).toHaveText(/Le Grand Chelem/)
})

test('a taken name is met kindly, with free names one tap away', async ({ page }) => {
  await asReturningVisitor(page)
  const sent = await mockRename(
    page,
    { status: 409, json: { error: 'taken', suggestions: ['Dupont7', 'Dupont42'] } },
    { status: 200, json: { username: 'Dupont42' } },
  )

  await page.goto('/')
  await badge(page).click()
  const field = badge(page).getByRole('textbox')
  await field.fill('Dupont')
  await badge(page).getByRole('button', { name: 'Save' }).click()

  await expect(badge(page).getByText('“Dupont” is already on the team sheet.')).toBeVisible()
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(field).toHaveValue('Dupont')

  await badge(page).getByRole('button', { name: 'Dupont42' }).click()
  await expect(badge(page)).toHaveText(/Dupont42/)
  expect(sent.map((body) => (body as { username: string }).username)).toEqual(['Dupont', 'Dupont42'])
})

test('a click elsewhere saves, like Enter — and a refused name keeps the field open', async ({ page }) => {
  await asReturningVisitor(page)
  const sent = await mockRename(
    page,
    { status: 409, json: { error: 'taken', suggestions: [] } },
    { status: 200, json: { username: 'Le Grand Chelem' } },
  )
  await page.goto('/')
  const elsewhere = page.getByRole('heading', { name: 'I Played With' })

  await badge(page).click()
  await badge(page).getByRole('textbox').fill('Dupont')
  await elsewhere.click()
  await expect(badge(page).getByText('“Dupont” is already on the team sheet.')).toBeVisible()
  await expect(badge(page).getByText('Try another one?')).toBeVisible()

  await badge(page).getByRole('textbox').fill('Le Grand Chelem')
  await elsewhere.click()
  await expect(badge(page)).toHaveText(/Le Grand Chelem/)
  expect(sent.map((body) => (body as { username: string }).username)).toEqual(['Dupont', 'Le Grand Chelem'])
})

test('a name breaking the rules is caught before any request', async ({ page }) => {
  await asReturningVisitor(page)
  const sent = await mockRename(page)

  await page.goto('/')
  await badge(page).click()
  await badge(page).getByRole('textbox').fill('hasty:prop')
  await page.keyboard.press('Enter')

  await expect(badge(page).getByText("Letters, digits, spaces and . _ ' - only.")).toBeVisible()
  expect(sent).toEqual([])
})

test('Escape or ✕ leaves the name as it was', async ({ page }) => {
  await asReturningVisitor(page)
  const sent = await mockRename(page)
  await page.goto('/')

  await badge(page).click()
  await badge(page).getByRole('textbox').fill('Nope')
  await page.keyboard.press('Escape')
  await expect(badge(page)).toHaveText(/Hasty Prop 042/)

  await badge(page).click()
  await badge(page).getByRole('textbox').fill('Nope')
  await badge(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(badge(page)).toHaveText(/Hasty Prop 042/)

  // Saving a generated name as displayed changes nothing: it stays translatable.
  await badge(page).click()
  await page.keyboard.press('Enter')
  await expect(badge(page)).toHaveText(/Hasty Prop 042/)
  expect(sent).toEqual([])
})

test('a rename breaking the rules is refused by the server before any database access', async ({ request }) => {
  const visitorId = '6f1c2b1e-8a5d-4c1b-9d3e-2f7a1b0c9e11'

  const badId = await request.patch('/api/visitor', { data: { visitorId: 'me', username: 'Dupont' } })
  expect(badId.status()).toBe(400)

  const badName = await request.patch('/api/visitor', { data: { visitorId, username: 'a:b:c' } })
  expect(badName.status()).toBe(400)
  expect(await badName.json()).toEqual({ error: 'invalid', problem: 'characters' })
})
