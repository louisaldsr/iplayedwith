import {
  test,
  expect,
  mockApi,
  asReturningVisitor,
  asRegisteredVisitor,
  sampleDailyChallenge,
  sampleDailyStats,
  sampleDailyLeaderboard,
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

test("the menu leads to each sport's daily challenge — free play and the past challenges are under it", async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Rugby — Daily challenge' })).toHaveAttribute('href', '/rugby')
  await expect(page.getByRole('link', { name: 'Football — Daily challenge' })).toHaveAttribute('href', '/football')
  await expect(page.getByRole('link', { name: 'Basketball — Daily challenge' })).toHaveAttribute('href', '/basketball')
  await expect(page.getByRole('link', { name: 'Formula 1 — Daily challenge' })).toHaveAttribute('href', '/formula1')
  // Launched: no sport is teased as coming any more.
  await expect(page.locator('.home-screen__sport-card--upcoming')).toHaveCount(0)
  await expect(page.locator('a[href$="/free"], a[href$="/archive"]')).toHaveCount(0)
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

test("the menu opens today's ranking: the podium and the visitor's place, a tab per sport", async ({ page }) => {
  await mockApi(page, '/api/rugby/daily/ranking', sampleDailyLeaderboard())
  await page.goto('/')
  // No accounts: nothing announced as coming.
  await expect(page.getByText('Log in')).toHaveCount(0)
  await expect(page.getByText('Soon', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Ranking', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: "Today's ranking" })
  const rugby = dialog.getByRole('tabpanel', { name: 'Rugby' })
  const podium = rugby.getByRole('list', { name: 'Podium' }).getByRole('listitem')
  await expect(podium).toHaveCount(3)
  // Generated names read in the reader's language, a typed one as is, a missing one as Anonymous.
  await expect(podium.nth(0)).toContainText('Hasty Prop 042')
  await expect(podium.nth(0)).toContainText('Perfect')
  await expect(podium.nth(0)).toContainText('1:02')
  await expect(podium.nth(1)).toContainText('Dupont')
  await expect(podium.nth(1)).toContainText('+1')
  await expect(podium.nth(2)).toContainText('Anonymous')
  await expect(rugby.locator('.daily-ranking__place')).toHaveText('Your rank5th / 12')

  // Football is mocked empty by default.
  await dialog.getByRole('tab', { name: 'Football' }).click()
  const football = dialog.getByRole('tabpanel', { name: 'Football' })
  await expect(football.getByText('Nobody has finished today yet.')).toBeVisible()
  await expect(football.getByText('Finish today to get your rank.')).toBeVisible()
})

test("the menu opens the visitor's stats: its name first, then a tab per sport", async ({ page }) => {
  await asRegisteredVisitor(page)
  await mockApi(page, '/api/rugby/daily/stats', sampleDailyStats)
  await page.goto('/')
  await page.getByRole('button', { name: 'My stats' }).click()

  // Whose stats: the visitor's name ("Hasty Prop 042", given at its first Start).
  const dialog = page.getByRole('dialog', { name: 'Your stats Hasty Prop 042' })
  await expect(dialog).toBeVisible()

  const rugby = dialog.getByRole('tabpanel', { name: 'Rugby' })
  await expect(dialog.getByRole('tab', { name: 'Rugby' })).toHaveAttribute('aria-selected', 'true')
  await expect(rugby.getByRole('definition')).toHaveText(['4', '75%']) // played, win rate
  await expect(rugby.locator('.daily-stats__bar--today')).toContainText('Today')

  // Football is mocked empty by default — one tab away, by click or by arrow key.
  await dialog.getByRole('tab', { name: 'Rugby' }).press('ArrowRight')
  await expect(dialog.getByRole('tab', { name: 'Football' })).toBeFocused()
  await expect(rugby).toBeHidden()
  await expect(dialog.getByRole('tabpanel', { name: 'Football' })).toContainText('No daily challenge finished yet.')
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
  const response = await page.goto('/curling')
  expect(response?.status()).toBe(404)
})
