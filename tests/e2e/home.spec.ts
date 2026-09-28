import { test, expect, mockApi, asReturningVisitor, sampleDailyChallenge } from './fixtures'

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

test('home page offers a Rugby and a Football sport link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Rugby' })).toHaveAttribute('href', '/rugby')
  await expect(page.getByRole('link', { name: 'Football' })).toHaveAttribute('href', '/football')
})

test('clicking a sport navigates to its route', async ({ page }) => {
  // The sport page loads the daily challenge as soon as it mounts.
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await page.goto('/')
  await page.getByRole('link', { name: 'Rugby' }).click()
  await expect(page).toHaveURL('/rugby')
})

test('an unknown sport in the URL 404s', async ({ page }) => {
  const response = await page.goto('/basketball')
  expect(response?.status()).toBe(404)
})
