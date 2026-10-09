import {
  test,
  expect,
  mockApi,
  asRegisteredVisitor,
  sampleDailyChallenge,
  sampleDailyStats,
  linkingPlayer,
} from './fixtures'

// A phone with Safari's toolbars showing: 390 wide, 664 of the 844 left to the page.
test.use({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true })

test('the rules open with "Let\'s play" in reach, without scrolling', async ({ page }) => {
  await page.goto('/')

  const start = page.getByRole('dialog').getByRole('button', { name: "Let's play" })
  await expect(start).toBeInViewport()
  await start.click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('the game: the clock and the name up top, the hearts in a corner, the field over the board', async ({ page }) => {
  await asRegisteredVisitor(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/rugby/daily/start', { username: 'hasty:prop:042' })
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()

  const bar = page.locator('.game-topbar')
  await expect(bar.locator('.game-topbar__chrono')).toBeVisible()
  await expect(bar.getByText('Hasty Prop 042')).toBeVisible()
  // A and B are on the board; the level said nothing worth the room.
  await expect(bar.getByText('Alpha Testeur')).toBeHidden()
  await expect(bar.getByText('Easy')).toHaveCount(0)

  // The hearts, stacked in the board's top-left corner.
  const hearts = (await page.locator('.lives-bar').boundingBox())!
  const area = (await page.locator('.game-screen-board').boundingBox())!
  expect(hearts.x - area.x).toBeLessThan(20)
  expect(hearts.y - area.y).toBeLessThan(20)
  expect(hearts.height).toBeGreaterThan(hearts.width * 2)

  // No bar under the board: it runs to the screen's foot, the field floating over it.
  const board = (await page.locator('.game-screen-board').boundingBox())!
  const field = (await page.getByPlaceholder('Player…').boundingBox())!
  expect(board.y + board.height).toBe(664)
  expect(field.y + field.height).toBeLessThan(664)
  expect(field.y).toBeGreaterThan(board.y)
})

test('the sport tabs stay on one row: the others by their icon, still named for screen readers', async ({ page }) => {
  await asRegisteredVisitor(page)
  for (const sport of ['rugby', 'football', 'basketball', 'formula1']) {
    await mockApi(page, `/api/${sport}/daily/stats`, sampleDailyStats)
  }
  await page.goto('/')
  await page.getByRole('button', { name: 'My stats' }).click()

  const tabs = page.getByRole('dialog').getByRole('tab')
  await expect(tabs).toHaveCount(4)
  const heights = await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
  expect(Math.max(...heights)).toBeLessThan(48)

  const football = page.getByRole('tab', { name: /Football/ })
  await expect(football.locator('.sport-tabs__label')).toHaveCSS('width', '1px')
  await football.click()
  await expect(football).toHaveAttribute('aria-selected', 'true')
  await expect(football.getByText('Football')).toBeVisible()
})

// The keyboard covers half a phone: typing happens in a sheet over the whole screen, the field at its
// very top where the keyboard never covers it — iOS has no reason to push the page.
test('typing on a phone opens a full-screen list, the field on top; a pick or the keyboard closed ends it', async ({
  page,
}) => {
  await asRegisteredVisitor(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/rugby/daily/start', { username: 'hasty:prop:042' })
  await mockApi(page, '/api/players', [linkingPlayer])
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()

  const field = page.getByPlaceholder('Player…')
  // Never focused on its own on a touch screen: the sheet would cover the board after every move.
  await expect(field).not.toBeFocused()
  await field.click()
  const sheet = page.locator('.autocomplete-wrapper--sheet')
  await expect(sheet).toBeVisible()
  const box = (await sheet.boundingBox())!
  expect(box.y).toBe(0)
  expect(box.width).toBe(390)
  expect((await field.boundingBox())!.y).toBeLessThan(30)

  // The keyboard open: iOS slides what is visible 300px down the page, 280px tall above the keyboard
  // — what `useVisibleViewport` reads from it. The sheet, field first, sits exactly there.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--visible-top', '300px')
    document.documentElement.style.setProperty('--visible-height', '280px')
  })
  const slid = (await sheet.boundingBox())!
  expect(slid.y).toBe(300)
  expect(slid.height).toBe(280)
  const top = (await field.boundingBox())!.y
  expect(top).toBeGreaterThanOrEqual(300)
  expect(top).toBeLessThan(330)

  await field.fill('cha')
  await page.getByRole('option', { name: 'Charlie Lien' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('.input-chip', { hasText: 'Charlie Lien' })).toBeVisible()

  // Back to the board without picking anyone: the back button…
  await page.locator('.input-chip').press('Escape')
  await page.getByPlaceholder('Player…').click()
  await page.getByRole('button', { name: 'Back to the board' }).click()
  await expect(page.locator('.autocomplete-wrapper--sheet')).toHaveCount(0)

  // …or the keyboard closed, which leaves the field.
  await page.getByPlaceholder('Player…').click()
  await expect(page.locator('.autocomplete-wrapper--sheet')).toBeVisible()
  await page.getByPlaceholder('Player…').blur()
  await expect(page.locator('.autocomplete-wrapper--sheet')).toHaveCount(0)
  await expect(page.getByPlaceholder('Player…')).toBeVisible()
})
