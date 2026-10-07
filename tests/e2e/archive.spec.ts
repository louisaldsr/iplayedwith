import {
  test,
  expect,
  mockApi,
  asReturningVisitor,
  sampleDailyArchive,
  sampleDailyChallenge,
  pastDailyChallenge,
  linkingPlayer,
  winningMove,
  parisToday,
  parisDaysAgo,
} from './fixtures'

// The archive: every past daily, playable late. What counts late (stats, ranking, never streaks)
// is the database's and the server's call, unit-tested there; the browser owes it the day it plays.

test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
  await mockApi(page, '/api/rugby/daily/archive', sampleDailyArchive)
})

test('lists every day, newest first, with how the visitor did', async ({ page }) => {
  await page.goto('/rugby/archive')

  await expect(page.getByRole('heading', { name: 'Past challenges — Rugby' })).toBeVisible()
  const days = page.locator('.archive-day')
  await expect(days).toHaveCount(4)
  await expect(days.nth(0)).toContainText('#7')
  await expect(days.nth(0)).toContainText('Today')
  await expect(days.nth(0)).toContainText('To play')
  await expect(days.nth(1)).toContainText('Lost')
  await expect(days.nth(2)).toContainText('+1')
  await expect(days.nth(2)).toContainText('late')
  await expect(days.nth(3)).toContainText('Alpha Testeur vs Bravo Éssai')

  // Today is played on its own page; a past day on its archive page.
  await expect(days.nth(0)).toHaveAttribute('href', '/rugby')
  await expect(days.nth(3)).toHaveAttribute('href', `/rugby/archive/${pastDailyChallenge.day}`)
})

test('plays a past day: Start and every move carry that day, and it ends like any daily', async ({ page }) => {
  await mockApi(page, '/api/players', [linkingPlayer])
  const sent: { path: string; body: Record<string, unknown> }[] = []
  for (const path of ['/api/rugby/daily/start', '/api/rugby/move']) {
    await page.route(
      (url) => url.pathname === path,
      (route) => {
        sent.push({ path, body: route.request().postDataJSON() })
        return route.fulfill(path.endsWith('move') ? { json: winningMove } : { status: 204 })
      },
    )
  }
  // Today already won here: playing a past day must not touch it.
  await page.addInitScript((day) => {
    if (!window.localStorage.getItem('ipw.daily.rugby')) {
      window.localStorage.setItem('ipw.daily.rugby', JSON.stringify({ day, livesLeft: 3, outcome: 'won' }))
    }
  }, parisToday())

  await page.goto(`/rugby/archive/${pastDailyChallenge.day}`)
  await expect(page.getByRole('heading', { name: 'Challenge #4' })).toBeVisible()
  await expect(page.getByText('Played late: it counts in your stats')).toBeVisible()

  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByPlaceholder('Player…').fill('cha')
  await page.locator('.autocomplete-item', { hasText: 'Charlie Lien' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('heading', { name: 'Congratulations!' })).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Past challenges' })).toHaveAttribute(
    'href',
    '/rugby/archive',
  )

  const visitorId = await page.evaluate(() => window.localStorage.getItem('ipw.playerId'))
  expect(sent).toEqual([
    { path: '/api/rugby/daily/start', body: { day: pastDailyChallenge.day, visitorId } },
    {
      path: '/api/rugby/move',
      body: expect.objectContaining({ daily: { visitorId, day: pastDailyChallenge.day } }),
    },
  ])

  // The past day is kept on its own; today's record — and the menu — are untouched.
  const stored = await page.evaluate(
    (day) => [window.localStorage.getItem(`ipw.daily.rugby.${day}`), window.localStorage.getItem('ipw.daily.rugby')],
    pastDailyChallenge.day,
  )
  expect(JSON.parse(stored[0]!)).toMatchObject({ day: pastDailyChallenge.day, outcome: 'won' })
  expect(JSON.parse(stored[1]!)).toMatchObject({ day: parisToday(), outcome: 'won' })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Rugby — Daily challenge (done today)' })).toBeVisible()
})

test('a past day the server already counts as lost opens on its end screen — no replay', async ({ page }) => {
  await page.goto(`/rugby/archive/${parisDaysAgo(1)}`)

  await expect(page.getByRole('heading', { name: 'Out of lives' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0)
})

test("today's day goes to its own page", async ({ page }) => {
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await page.goto(`/rugby/archive/${parisToday()}`)

  await expect(page).toHaveURL('/rugby')
  await expect(page.getByRole('heading', { name: 'Daily Challenge #7' })).toBeVisible()
})

test('a day without a challenge says so, and leads back to the list', async ({ page }) => {
  await page.goto('/rugby/archive/2000-01-01')

  await expect(page.getByText('There is no challenge on that day.')).toBeVisible()
  await page.getByRole('link', { name: 'Back to past challenges' }).click()
  await expect(page).toHaveURL('/rugby/archive')
})
