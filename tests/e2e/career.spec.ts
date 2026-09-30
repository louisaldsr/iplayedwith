import { Page } from '@playwright/test'
import {
  test,
  expect,
  mockApi,
  asReturningVisitor,
  sampleDailyChallenge,
  sampleCareer,
  linkingPlayer,
  winningMove,
} from './fixtures'

/** Charlie joins the board without closing the chain. */
const partialMove = { ...winningMove, edges: winningMove.edges.slice(0, 2), victory: false, path: [] }

test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/rugby/daily/start', {})
  await mockApi(page, '/api/players', [linkingPlayer])
  await mockApi(page, '/api/players/p-alpha/career', sampleCareer)
  await mockApi(page, '/api/players/p-charlie/career', { ...sampleCareer, player: linkingPlayer })
})

const card = (page: Page, name: string) => page.getByRole('button', { name: `${name} — View career` })
const career = (page: Page) => page.getByRole('dialog')

async function playCharlie(page: Page) {
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByPlaceholder('Player…').fill('cha')
  await page.locator('.autocomplete-item', { hasText: 'Charlie Lien' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(card(page, 'Charlie Lien')).toBeVisible()
}

async function trackHints(page: Page) {
  const hints: Record<string, unknown>[] = []
  await page.route(
    (url) => url.pathname === '/api/rugby/daily/hint',
    (route) => {
      hints.push(route.request().postDataJSON())
      return route.fulfill({ status: 204 })
    },
  )
  return hints
}

test('a player added to the board opens their career — recorded as a hint in the daily', async ({ page }) => {
  const hints = await trackHints(page)
  await mockApi(page, '/api/rugby/move', partialMove)
  await playCharlie(page)

  await card(page, 'Charlie Lien').click()
  await expect(career(page).getByRole('heading', { name: 'Charlie Lien' })).toBeVisible()
  await expect(career(page).getByText('Club Un')).toBeVisible()
  await career(page).getByRole('button', { name: 'Close' }).click()

  const visitorId = await page.evaluate(() => window.localStorage.getItem('ipw.playerId'))
  await expect.poll(() => hints).toEqual([{ day: sampleDailyChallenge.day, visitorId, playerId: 'p-charlie' }])
})

test("A's and B's careers stay free: no hint", async ({ page }) => {
  const hints = await trackHints(page)
  await mockApi(page, '/api/rugby/move', partialMove)
  await playCharlie(page)

  await card(page, 'Alpha Testeur').click()
  await expect(career(page).getByRole('heading', { name: 'Alpha Testeur' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Give a stray request the time to land before asserting there was none.
  await page.waitForTimeout(300)
  expect(hints).toEqual([])
})

test('dragging a card moves it, without opening the career', async ({ page }) => {
  await mockApi(page, '/api/rugby/move', partialMove)
  await playCharlie(page)

  const box = (await card(page, 'Charlie Lien').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 5 })
  await page.mouse.up()

  await expect(career(page)).toBeHidden()
  const moved = (await card(page, 'Charlie Lien').boundingBox())!
  expect(moved.x).not.toBe(box.x)
})

test('after the win, careers still open — but are no longer hints', async ({ page }) => {
  const hints = await trackHints(page)
  await mockApi(page, '/api/rugby/move', winningMove)
  await playCharlie(page)
  await page.getByRole('button', { name: 'See the board' }).click()

  await card(page, 'Charlie Lien').click()
  await expect(career(page).getByRole('heading', { name: 'Charlie Lien' })).toBeVisible()

  await page.waitForTimeout(300)
  expect(hints).toEqual([])
})

test('a hint without a proper visitor, day or player is refused before any database access', async ({ request }) => {
  const visitorId = '6f1c2b1e-8a5d-4c1b-9d3e-2f7a1b0c9e11'
  for (const data of [
    { day: '2026-07-15', visitorId: 'me', playerId: 'p' },
    { day: 'today', visitorId, playerId: 'p' },
    { day: '2026-07-15', visitorId },
  ]) {
    expect((await request.post('/api/rugby/daily/hint', { data })).status()).toBe(400)
  }
})
