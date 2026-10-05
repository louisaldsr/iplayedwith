import {
  test,
  expect,
  mockApi,
  asReturningVisitor,
  sampleDailyChallenge,
  sampleDailyStats,
  parisToday,
} from './fixtures'

// A returning visitor: the first-visit rules pop-up is modal and would block these clicks.
// First visits are covered by onboarding.spec.ts.
test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
})

test('home page shows the main heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('I Played With')
})

test('home page has the correct document title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/I Played With/)
})

test('the menu leads to each sport daily challenge, and to free play', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Rugby — Daily challenge' })).toHaveAttribute('href', '/rugby')
  await expect(page.getByRole('link', { name: 'Football — Daily challenge' })).toHaveAttribute('href', '/football')
  await expect(page.getByRole('link', { name: 'Rugby — Free play' })).toHaveAttribute('href', '/rugby/free')
  await expect(page.getByRole('link', { name: 'Football — Free play' })).toHaveAttribute('href', '/football/free')
})

test("today's finished challenges are marked won or lost; yesterday's are not", async ({ page }) => {
  await page.addInitScript((day) => {
    window.localStorage.setItem('ipw.daily.rugby', JSON.stringify({ day, livesLeft: 2, outcome: 'won' }))
    window.localStorage.setItem('ipw.daily.football', JSON.stringify({ day, livesLeft: 0, outcome: 'lost' }))
  }, parisToday())
  await page.goto('/')

  await expect(page.getByRole('link', { name: 'Rugby — Daily challenge (done today)' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Football — Daily challenge (lost today)' })).toBeVisible()
})

test("yesterday's result does not colour today's menu", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('ipw.daily.rugby', JSON.stringify({ day: '2000-01-01', livesLeft: 0, outcome: 'lost' }))
  })
  await page.goto('/')

  await expect(page.getByRole('link', { name: 'Rugby — Daily challenge', exact: true })).toBeVisible()
})

test('features that need an account are listed as coming soon, not as links', async ({ page }) => {
  await page.goto('/')
  const soon = page.getByRole('list', { name: 'Soon' })
  for (const entry of ['Ranking', 'Log in']) {
    await expect(soon.getByText(entry)).toBeVisible()
    await expect(page.getByRole('link', { name: entry })).toHaveCount(0)
  }
})

test("the menu opens the visitor's stats, one section per sport", async ({ page }) => {
  await mockApi(page, '/api/rugby/daily/stats', sampleDailyStats)
  await page.goto('/')
  await page.getByRole('button', { name: 'My stats' }).click()

  const dialog = page.getByRole('dialog', { name: 'Your stats' })
  const rugby = dialog.getByRole('region', { name: '🏉 Rugby' })
  await expect(rugby.getByRole('definition').first()).toHaveText('4') // played
  await expect(rugby.getByText('75')).toBeVisible() // win %
  await expect(rugby.getByText('+0.7')).toBeVisible() // average
  // Football is mocked empty by default.
  await expect(dialog.getByRole('region', { name: '⚽ Football' })).toContainText('No daily challenge finished yet.')
})

test('the menu opens the rules and the About page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('button', { name: 'How to play' }).click()
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: 'About' }).click()
  await expect(page).toHaveURL('/about')
  await expect(page.getByRole('heading', { name: 'Data', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'louisaldsr' })).toHaveAttribute('href', 'https://github.com/louisaldsr')
})

test('every other page has a way back to the menu; the menu itself does not', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Menu' })).toHaveCount(0)

  await page.goto('/rugby/free')
  await page.getByRole('link', { name: 'Menu' }).click()
  await expect(page).toHaveURL('/')
})

test('clicking a sport navigates to its route', async ({ page }) => {
  // The sport page loads the daily challenge as soon as it mounts.
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await page.goto('/')
  await page.getByRole('link', { name: 'Rugby — Daily challenge' }).click()
  await expect(page).toHaveURL('/rugby')
})

test('an unknown sport in the URL 404s', async ({ page }) => {
  const response = await page.goto('/basketball')
  expect(response?.status()).toBe(404)
})
