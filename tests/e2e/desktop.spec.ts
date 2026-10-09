import { test, expect, mockApi, asRegisteredVisitor, sampleDailyChallenge } from './fixtures'

// The phone's game screen (`mobile.spec.ts`) is its own: a computer keeps its layout — A → B on the
// left of the top bar, the clock in the very middle, the name on the right; the hearts in a row at
// the bottom of the board.
test.use({ viewport: { width: 1280, height: 800 } })

test('a computer: A → B, the clock centred and the name across the top; the hearts at the bottom', async ({ page }) => {
  await asRegisteredVisitor(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/rugby/daily/start', { username: 'hasty:prop:042' })
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()

  const bar = page.locator('.game-topbar')
  const barBox = (await bar.boundingBox())!
  const players = (await bar.locator('.game-topbar__players').boundingBox())!
  const clock = (await bar.locator('.game-topbar__chrono').boundingBox())!
  const name = (await bar.getByText('Hasty Prop 042').boundingBox())!

  await expect(bar.locator('.game-topbar__players')).toContainText('Alpha Testeur')
  await expect(bar.locator('.game-topbar__players')).toContainText('Bravo Éssai')
  await expect(bar.getByText('Easy')).toHaveCount(0)
  expect(players.x + players.width).toBeLessThan(clock.x)
  expect(clock.x + clock.width / 2).toBeCloseTo(barBox.x + barBox.width / 2, 0)
  expect(name.x).toBeGreaterThan(clock.x + clock.width)

  // In a row, centred at the bottom of the board.
  const hearts = (await page.locator('.lives-bar').boundingBox())!
  const board = (await page.locator('.game-screen-board').boundingBox())!
  expect(hearts.width).toBeGreaterThan(hearts.height * 2)
  expect(hearts.x + hearts.width / 2).toBeCloseTo(board.x + board.width / 2, 0)
  expect(board.y + board.height - (hearts.y + hearts.height)).toBeLessThan(30)
})
