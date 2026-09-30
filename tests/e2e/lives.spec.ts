import { Page } from '@playwright/test'
import {
  test,
  expect,
  mockApi,
  asReturningVisitor,
  sampleDailyChallenge,
  linkingPlayer,
  notConnectedMove,
  parisToday,
} from './fixtures'

test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/rugby/daily/start', {})
  await mockApi(page, '/api/players', [linkingPlayer])
})

const lives = (page: Page) => page.getByRole('img', { name: /lives left/ })

async function startDaily(page: Page) {
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
}

async function guess(page: Page) {
  await page.getByPlaceholder('Player…').fill('cha')
  await page.getByText('Charlie Lien').click()
  await page.getByRole('button', { name: 'Submit' }).click()
}

test('a guess linked to nobody costs a life and flashes the screen; the third ends the day', async ({ page }) => {
  await mockApi(page, '/api/rugby/move', notConnectedMove)
  await startDaily(page)
  await expect(lives(page)).toHaveAccessibleName('3 of 3 lives left')

  await guess(page)
  await expect(lives(page)).toHaveAccessibleName('2 of 3 lives left')
  await expect(page.locator('.life-flash')).toBeAttached()
  await expect(page.getByText('No club and season in common with anyone on the board.')).toBeVisible()

  await guess(page)
  await expect(lives(page)).toHaveAccessibleName('1 of 3 lives left')

  await guess(page)
  await expect(page.getByRole('heading', { name: 'Out of lives' })).toBeVisible()

  // The day is over: coming back shows the result, not a fresh game.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Out of lives' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Back to the menu' }).click()
  await expect(page.getByRole('link', { name: 'Rugby — Daily challenge (lost today)' })).toBeVisible()
})

test('a duplicate or a failed request is not a wrong guess: no life lost', async ({ page }) => {
  let call = 0
  await page.route(
    (url) => url.pathname === '/api/rugby/move',
    (route) =>
      ++call === 1
        ? route.fulfill({ json: { ok: false, code: 'already-on-board', reason: 'Ce joueur est déjà dans le graphe.' } })
        : route.fulfill({ status: 500, json: { error: 'internal server error' } }),
  )
  await startDaily(page)

  await guess(page)
  await expect(page.getByText('Already on the board.', { exact: true })).toBeVisible()
  await guess(page)
  await expect(page.getByText('Something went wrong — try again.')).toBeVisible()

  await expect(lives(page)).toHaveAccessibleName('3 of 3 lives left')
  await expect(page.locator('.life-flash')).toHaveCount(0)
})

test('reloading keeps the lives already lost today', async ({ page }) => {
  await page.addInitScript((day) => {
    window.localStorage.setItem('ipw.daily.rugby', JSON.stringify({ day, livesLeft: 1 }))
  }, parisToday())
  await startDaily(page)

  await expect(lives(page)).toHaveAccessibleName('1 of 3 lives left')
})

test('free play has no lives', async ({ page }) => {
  await page.goto('/rugby/free')
  await expect(lives(page)).toHaveCount(0)
})
