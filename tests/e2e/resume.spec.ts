import { Page } from '@playwright/test'
import {
  test,
  expect,
  mockApi,
  asReturningVisitor,
  sampleDailyChallenge,
  linkingPlayer,
  notConnectedMove,
  winningMove,
} from './fixtures'

/** A guess that joins the board without closing the chain — the day goes on. */
const partialMove = { ...winningMove, edges: winningMove.edges.slice(0, 2), victory: false, path: [] }

/** Another guess, once Charlie is on the board — the search leaves out players already there. */
const delta = { id: 'p-delta', name: 'Delta Autre', sport: 'rugby' }

test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/players', [linkingPlayer, delta])
})

const lives = (page: Page) => page.getByRole('img', { name: /lives left/ })
const board = (page: Page) => page.locator('.game-screen-board')

async function guess(page: Page, name = 'Charlie Lien') {
  await page.getByPlaceholder('Player…').fill(name.slice(0, 3))
  await page.locator('.autocomplete-item', { hasText: name }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
}

test('a launched daily reopens on its board, not on the intro', async ({ page }) => {
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(lives(page)).toBeVisible()

  await page.goto('/')
  await page.goto('/rugby')

  await expect(lives(page)).toHaveAccessibleName('3 of 3 lives left')
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0)
})

test('leaving mid-game resumes the same board and lives', async ({ page }) => {
  let call = 0
  await page.route(
    (url) => url.pathname === '/api/rugby/move',
    (route) => route.fulfill({ json: ++call === 1 ? partialMove : notConnectedMove }),
  )
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()

  await guess(page)
  await expect(board(page).getByText('Charlie Lien')).toBeVisible()
  await guess(page, delta.name)
  await expect(lives(page)).toHaveAccessibleName('2 of 3 lives left')

  await page.reload()

  await expect(board(page).getByText('Charlie Lien')).toBeVisible()
  await expect(lives(page)).toHaveAccessibleName('2 of 3 lives left')
})

test('the next move after a resume carries the saved board to the server', async ({ page }) => {
  const sent: { graph: { players: string[]; edges: unknown[] } }[] = []
  await page.route(
    (url) => url.pathname === '/api/rugby/move',
    (route) => {
      sent.push(route.request().postDataJSON())
      return route.fulfill({ json: sent.length === 1 ? partialMove : winningMove })
    },
  )
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  await guess(page)
  await expect(board(page).getByText('Charlie Lien')).toBeVisible()

  await page.reload()
  await guess(page, delta.name)
  await expect(page.getByRole('heading', { name: 'Congratulations!' })).toBeVisible()

  expect(sent[1].graph.players).toEqual(['p-alpha', 'p-bravo', 'p-charlie'])
  expect(sent[1].graph.edges).toEqual(partialMove.edges)
})

test('a win keeps the board on screen: the results pop up over it, close, and reopen', async ({ page }) => {
  await mockApi(page, '/api/rugby/move', winningMove)
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  await guess(page)

  const results = page.getByRole('dialog', { name: 'Congratulations!' })
  await expect(results).toBeVisible()
  await expect(results.getByText('Alpha Testeur → Charlie Lien → Bravo Éssai')).toBeVisible()

  await results.getByRole('button', { name: 'See the board' }).click()
  await expect(results).toBeHidden()
  await expect(page.locator('.game-board--won .node-card--highlighted')).toHaveCount(3)
  await expect(page.getByText('Chain complete — 2 links')).toBeVisible()
  await expect(page.getByPlaceholder('Player…')).toHaveCount(0)

  await page.getByRole('button', { name: 'Results' }).click()
  await expect(results).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(results).toBeHidden()

  // Coming back to a won day shows the winning board again, results closed.
  await page.reload()
  await expect(page.locator('.game-board--won .node-card--highlighted')).toHaveCount(3)
  await expect(results).toBeHidden()
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0)
})
