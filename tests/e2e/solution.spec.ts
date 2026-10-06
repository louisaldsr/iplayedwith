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
  await expect(page.getByRole('switch', { name: 'Proposed Solution' })).toHaveCount(0)
  for (let i = 0; i < 3; i++) await guess(page)
  expect(asked).toEqual([])

  const results = page.getByRole('dialog', { name: 'Out of lives' })
  await results.getByRole('button', { name: 'Show the proposed solution' }).click()
  await expect(results).toBeHidden()

  // Charlie was never on this board: a proposed card, fully lit.
  await expect(page.locator('.node-card--proposed')).toHaveText(/Charlie Lien/)
  await expect(page.locator('.node-card--proposed')).toHaveCSS('opacity', '1')
  await expect(page.locator('.node-card--solution')).toHaveCount(3)
  await expect(page.locator('.graph-edge--solution')).toHaveCount(2)
  expect(asked).toHaveLength(1)

  // A switch: the pop-up's button turned it on; off, nothing of the solution stays.
  const toggle = page.getByRole('switch', { name: 'Proposed Solution' })
  await expect(toggle).toBeChecked()
  // On the board itself, at its top — not in the bar under it.
  await expect(page.locator('.game-screen-board .solution-overlay')).toContainText('Proposed Solution')
  await expect(page.locator('.game-screen-controls').getByRole('switch')).toHaveCount(0)
  await toggle.uncheck()
  await expect(page.locator('.node-card--proposed')).toHaveCount(0)
  await expect(page.locator('.game-board--solution')).toHaveCount(0)
  // Shown again from memory: asked once.
  await toggle.check()
  await expect(page.locator('.node-card--proposed')).toHaveCount(1)
  expect(asked).toHaveLength(1)
})

test("the visitor's own players on the solution join it, once; the rest of the board steps back", async ({ page }) => {
  // Delta, linked to Alpha, is on the board but not on the solution; Alpha and Bravo are on both.
  const delta = { id: 'p-delta', name: 'Delta Impasse', sport: 'rugby' }
  const deltaMove = {
    ok: true,
    node: { kind: 'player', player: delta },
    edges: [
      { playerId: 'p-delta', clubId: 'c-one', season: '2016-2017' },
      { playerId: 'p-alpha', clubId: 'c-one', season: '2016-2017' },
    ],
    clubs: [sampleSolution.clubs[0]],
    victory: false,
    path: [],
  }
  let moves = 0
  await page.route(
    (url) => url.pathname === '/api/rugby/move',
    (route) => route.fulfill({ json: moves++ === 0 ? deltaMove : notConnectedMove }),
  )
  await mockApi(page, '/api/rugby/daily/solution', sampleSolution)
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  for (let i = 0; i < 4; i++) await guess(page)

  await page.getByRole('dialog', { name: 'Out of lives' }).getByRole('button', { name: 'See the board' }).click()
  await page.getByRole('switch', { name: 'Proposed Solution' }).check()

  // One card per player: Alpha and Bravo are not doubled, Charlie is the only proposed one.
  await expect(page.locator('.node-card')).toHaveCount(4)
  await expect(page.locator('.node-card--proposed')).toHaveText(/Charlie Lien/)
  const card = (name: string) => page.locator('.game-board .node-card', { hasText: name })
  await expect(card('Alpha Testeur')).toHaveClass(/node-card--solution/)
  await expect(card('Alpha Testeur')).toHaveCSS('opacity', '1')
  // Delta is the visitor's own, off the solution: in the shadow.
  await expect(card('Delta Impasse')).not.toHaveClass(/node-card--solution/)
  await expect(card('Delta Impasse')).toHaveCSS('opacity', '0.18')
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

test('on a won board, a solution through someone else lights its proposed player — never dimmed', async ({ page }) => {
  // The stored solution goes through Echo; the winner went through Charlie.
  const echo = { id: 'p-echo', name: 'Echo Autre', sport: 'rugby' }
  const viaEcho = {
    ...sampleSolution,
    path: ['p-alpha', 'p-echo', 'p-bravo'],
    players: [sampleSolution.players[0], echo, sampleSolution.players[2]],
    edges: sampleSolution.edges.map((e) => (e.playerId === 'p-charlie' ? { ...e, playerId: 'p-echo' } : e)),
  }
  await mockApi(page, '/api/rugby/move', winningMove)
  await mockApi(page, '/api/rugby/daily/solution', viaEcho)
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  await guess(page)
  await page.getByRole('dialog', { name: 'Congratulations!' }).getByRole('button', { name: 'See the board' }).click()
  await page.getByRole('switch', { name: 'Proposed Solution' }).check()

  const card = (name: string) => page.locator('.game-board .node-card', { hasText: name })
  await expect(card('Echo Autre')).toHaveClass(/node-card--proposed/)
  await expect(card('Echo Autre')).toHaveCSS('opacity', '1')
  await expect(card('Alpha Testeur')).toHaveCSS('opacity', '1')
  // The winner's Charlie is off this solution: in the shadow, gold chain or not.
  await expect(card('Charlie Lien')).toHaveCSS('opacity', '0.18')
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
  await expect(page.locator('.solution-overlay__error')).toHaveText('The solution could not be loaded — try again.')
  await expect(page.locator('.node-card--solution')).toHaveCount(0)
})

test('a day lost before boards were kept still shows the proposed solution, over A and B', async ({ page }) => {
  await page.addInitScript(
    (day) => window.localStorage.setItem('ipw.daily.rugby', JSON.stringify({ day, livesLeft: 0, outcome: 'lost' })),
    sampleDailyChallenge.day,
  )
  await mockApi(page, '/api/rugby/daily/solution', sampleSolution)
  await page.goto('/rugby')
  await expect(page.getByRole('heading', { name: 'Out of lives' })).toBeVisible()

  await page.getByRole('switch', { name: 'Proposed Solution' }).check()
  const board = page.locator('.daily-finished__board')
  await expect(board.locator('.node-card--proposed')).toHaveText(/Charlie Lien/)
  await expect(board.locator('.node-card--solution')).toHaveCount(3)
  await expect(page.getByText('Your board from this game was not kept')).toBeVisible()

  // Unchecked: the board of A and B, nothing of the solution.
  await page.getByRole('switch', { name: 'Proposed Solution' }).uncheck()
  await expect(board.locator('.node-card--proposed')).toHaveCount(0)
  await expect(board.locator('.node-card')).toHaveCount(2)
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
