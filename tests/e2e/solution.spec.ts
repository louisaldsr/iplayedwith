import {
  test,
  expect,
  mockApi,
  asReturningVisitor,
  sampleDailyChallenge,
  sampleSolution,
  linkingPlayer,
  winningMove,
} from './fixtures'

// Whether the solution may be revealed is the server's call (it checks the visitor's recorded
// outcome — tests/unit/services/dailySolutionService.test.ts). The page asks once the day is over,
// says it is ONE shortest chain, and shows nothing when refused.

test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
})

const asLostToday = (page: import('@playwright/test').Page) =>
  page.addInitScript(
    (day) => window.localStorage.setItem('ipw.daily.rugby', JSON.stringify({ day, livesLeft: 0, outcome: 'lost' })),
    sampleDailyChallenge.day,
  )

test('a lost day shows one of the shortest chains, link by link', async ({ page }) => {
  await asLostToday(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  const asked = await mockApi(page, '/api/rugby/daily/solution', sampleSolution)
  await page.goto('/rugby')

  const solution = page.getByRole('region', { name: 'One of the shortest chains' })
  await expect(solution.getByRole('listitem')).toHaveText([
    'Alpha TesteurClub Un · 2016-2017',
    'Charlie LienClub Deux · 2019-2020',
    'Bravo Éssai',
  ])
  await expect(solution).toContainText('Other chains of 2 links may exist')
  expect(asked.length).toBeGreaterThan(0)
})

test('a refused solution shows nothing — the day is not over on the server', async ({ page }) => {
  await asLostToday(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await page.goto('/rugby')

  await expect(page.getByRole('heading', { name: 'Out of lives' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'One of the shortest chains' })).toHaveCount(0)
})

test('a winner opens the solution from the results, on demand', async ({ page }) => {
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/players', [linkingPlayer])
  await mockApi(page, '/api/rugby/daily/start', {})
  await mockApi(page, '/api/rugby/move', winningMove)
  const asked = await mockApi(page, '/api/rugby/daily/solution', sampleSolution)
  await page.goto('/rugby')

  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByPlaceholder('Player…').fill('cha')
  await page.getByText('Charlie Lien').click()
  await page.getByRole('button', { name: 'Submit' }).click()

  const results = page.getByRole('dialog', { name: 'Congratulations!' })
  await expect(results).toBeVisible()
  expect(asked).toHaveLength(0)

  await results.getByText('See one of the shortest chains').click()
  await expect(results.getByRole('region', { name: 'One of the shortest chains' })).toContainText(
    'Club Deux · 2019-2020',
  )
})

test('the solution is refused before any database access without a proper visitor id or day', async ({ request }) => {
  for (const data of [{}, { day: sampleDailyChallenge.day, visitorId: 'nope' }, { visitorId: crypto.randomUUID() }]) {
    const res = await request.post('/api/rugby/daily/solution', { data })
    expect(res.status()).toBe(400)
  }
  expect((await request.post('/api/basketball/daily/solution', { data: {} })).status()).toBe(404)
})
