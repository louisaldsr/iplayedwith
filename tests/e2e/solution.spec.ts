import { Page } from '@playwright/test'
import {
  test,
  expect,
  mockApi,
  asReturningVisitor,
  sampleDailyChallenge,
  sampleSolution,
  linkingPlayer,
  notConnectedMove,
  winningMove,
} from './fixtures'

// Whether the solution may be revealed is the server's call: it checks the visitor's recorded
// outcome (tests/unit/services/dailySolutionService.test.ts). The page never asks before the day is
// over, asks only when told to, and lays the answer over the visitor's own board.

test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/rugby/daily/start', {})
  await mockApi(page, '/api/players', [linkingPlayer])
})

async function guess(page: Page) {
  await page.getByPlaceholder('Player…').fill('cha')
  await page.getByText('Charlie Lien').click()
  await page.getByRole('button', { name: 'Submit' }).click()
}

/** Every request made to the solution endpoint. */
function watchSolution(page: Page) {
  const asked: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/daily/solution')) asked.push(r.url())
  })
  return asked
}

test('a lost day keeps its board, and lays the proposed solution over it on demand', async ({ page }) => {
  const asked = watchSolution(page)
  await mockApi(page, '/api/rugby/move', notConnectedMove)
  await mockApi(page, '/api/rugby/daily/solution', sampleSolution)
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()

  // While the day is played, nothing of the solution: no button, no request.
  await expect(page.getByRole('button', { name: 'Show the proposed solution' })).toHaveCount(0)
  for (let i = 0; i < 3; i++) await guess(page)
  expect(asked).toEqual([])

  const results = page.getByRole('dialog', { name: 'Out of lives' })
  await results.getByRole('button', { name: 'Show the proposed solution' }).click()
  await expect(results).toBeHidden()

  // Charlie was never on this board: a proposed card, with the legend saying it is ONE chain.
  await expect(page.locator('.node-card--proposed')).toHaveText(/Charlie Lien/)
  await expect(page.locator('.node-card--solution')).toHaveCount(3)
  await expect(page.locator('.graph-edge--solution')).toHaveCount(2)
  await expect(
    page.getByText('Proposed solution: one of the shortest chains (2 links) — others may exist.'),
  ).toBeVisible()
  expect(asked).toHaveLength(1)

  await page.getByRole('button', { name: 'Hide the proposed solution' }).click()
  await expect(page.locator('.node-card--proposed')).toHaveCount(0)
  // Shown again from memory: asked once.
  await page.getByRole('button', { name: 'Show the proposed solution' }).click()
  await expect(page.locator('.node-card--proposed')).toHaveCount(1)
  expect(asked).toHaveLength(1)
})

test('a winner lays the proposed solution over the winning board from the results', async ({ page }) => {
  await mockApi(page, '/api/rugby/move', winningMove)
  await mockApi(page, '/api/rugby/daily/solution', sampleSolution)
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  await guess(page)

  await page
    .getByRole('dialog', { name: 'Congratulations!' })
    .getByRole('button', { name: 'Show the proposed solution' })
    .click()

  // The same chain as the winner's: nothing proposed, the winner's own cards ringed.
  await expect(page.locator('.node-card--solution')).toHaveCount(3)
  await expect(page.locator('.node-card--proposed')).toHaveCount(0)
})

test('a refused solution says so, and the board stays as it was', async ({ page }) => {
  await mockApi(page, '/api/rugby/move', notConnectedMove)
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  for (let i = 0; i < 3; i++) await guess(page)

  await page
    .getByRole('dialog', { name: 'Out of lives' })
    .getByRole('button', { name: 'Show the proposed solution' })
    .click()
  await expect(page.locator('.end-bar__error')).toHaveText('The solution could not be loaded — try again.')
  await expect(page.locator('.node-card--solution')).toHaveCount(0)
})

test('the solution is never stored in the browser', async ({ page }) => {
  await mockApi(page, '/api/rugby/move', notConnectedMove)
  await mockApi(page, '/api/rugby/daily/solution', sampleSolution)
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  for (let i = 0; i < 3; i++) await guess(page)
  await page
    .getByRole('dialog', { name: 'Out of lives' })
    .getByRole('button', { name: 'Show the proposed solution' })
    .click()
  await expect(page.locator('.node-card--proposed')).toHaveCount(1)

  const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage }))
  expect(stored).not.toContain('Club Deux')
  expect(stored).not.toContain(linkingPlayer.id)
})

test('the solution is refused before any database access without a proper visitor id or day', async ({ request }) => {
  for (const data of [{}, { day: sampleDailyChallenge.day, visitorId: 'nope' }, { visitorId: crypto.randomUUID() }]) {
    const res = await request.post('/api/rugby/daily/solution', { data })
    expect(res.status()).toBe(400)
  }
  expect((await request.post('/api/basketball/daily/solution', { data: {} })).status()).toBe(404)
})
