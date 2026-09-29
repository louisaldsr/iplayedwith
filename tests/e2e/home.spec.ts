import { test, expect, mockApi, asReturningVisitor, sampleDailyChallenge, parisToday } from './fixtures'

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

test("a sport whose challenge was won today is marked done; yesterday's win is not", async ({ page }) => {
  const today = parisToday()
  await page.addInitScript((day) => {
    window.localStorage.setItem('ipw.dailyDone.rugby', day)
    window.localStorage.setItem('ipw.dailyDone.football', '2000-01-01')
  }, today)
  await page.goto('/')

  await expect(page.getByRole('link', { name: 'Rugby — Daily challenge (done today)' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Football — Daily challenge', exact: true })).toBeVisible()
})

test('features that need an account are listed as coming soon, not as links', async ({ page }) => {
  await page.goto('/')
  const soon = page.getByRole('list', { name: 'Soon' })
  for (const entry of ['Ranking', 'My stats', 'Log in']) {
    await expect(soon.getByText(entry)).toBeVisible()
    await expect(page.getByRole('link', { name: entry })).toHaveCount(0)
  }
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
