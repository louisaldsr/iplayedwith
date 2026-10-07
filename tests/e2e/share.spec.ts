import { Page } from '@playwright/test'
import {
  test,
  expect,
  mockApi,
  asReturningVisitor,
  sampleDailyChallenge,
  sampleDailyArchive,
  pastDailyChallenge,
  linkingPlayer,
  winningMove,
  notConnectedMove,
} from './fixtures'

// The message itself — squares, score, hearts — is built in src/lib/dailyShare.ts and tested there.
// What the page owes it: a Share button once the day is over, and a link that opens the game.

/** Desktop Chromium has a fine pointer: Share copies. The clipboard is stubbed to read it back. */
async function captureClipboard(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          ;(window as unknown as { copied: string }).copied = text
        },
      },
    })
  })
}

const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied?: string }).copied)

test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
  await captureClipboard(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/rugby/daily/start', {})
  await mockApi(page, '/api/players', [linkingPlayer])
})

async function playOnce(page: Page) {
  await page.getByPlaceholder('Player…').fill('cha')
  await page.getByText('Charlie Lien').click()
  await page.getByRole('button', { name: 'Submit' }).click()
}

test('a won day is shared from its results: the pair, squares, score, a link to the day', async ({ page }) => {
  await mockApi(page, '/api/rugby/move', winningMove)
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  await playOnce(page)

  const results = page.getByRole('dialog', { name: 'Congratulations!' })
  await results.getByRole('button', { name: 'Share' }).click()
  await expect(results.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible()

  const lines = (await copied(page))!.split('\n')
  expect(lines[0]).toBe('I Played With · Rugby #7')
  expect(lines[1]).toBe('Alpha Testeur → Bravo Éssai')
  expect(lines[2]).toBe('🟩')
  expect(lines[3]).toMatch(/^Perfect! · ❤️❤️❤️ · \d+:\d\d$/)
  expect(lines[4]).toBe('Shortest chain found')
  expect(lines[5]).toBe('iplayedwith.com/rugby/7')

  // Closed, the results leave the end bar — Share is there too.
  await results.getByRole('button', { name: 'See the board' }).click()
  await expect(page.locator('.won-bar').getByRole('button', { name: 'Share' })).toBeVisible()
})

test('a lost day is shared too, with a dare', async ({ page }) => {
  await mockApi(page, '/api/rugby/move', notConnectedMove)
  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  for (let i = 0; i < 3; i++) await playOnce(page)

  const defeat = page.getByRole('dialog', { name: 'Out of lives' })
  await defeat.getByRole('button', { name: 'Share' }).click()

  expect(await copied(page)).toBe(
    [
      'I Played With · Rugby #7',
      'Alpha Testeur → Bravo Éssai',
      '💔 Out of lives · 🤍🤍🤍',
      'Can you do better?',
      'iplayedwith.com/rugby/7',
    ].join('\n'),
  )
})

test('a shared link opens the day it names — a past one from the archive', async ({ page }) => {
  await mockApi(page, '/api/rugby/daily/archive', sampleDailyArchive)
  await page.goto(`/rugby/${pastDailyChallenge.number}`)

  await expect(page.getByRole('heading', { name: `Challenge #${pastDailyChallenge.number}` })).toBeVisible()
  await expect(page.getByText('Played late: it counts in your stats')).toBeVisible()
  await expect(page).toHaveURL(`/rugby/${pastDailyChallenge.number}`)
})

test("a shared link to today opens today's page", async ({ page }) => {
  await mockApi(page, '/api/rugby/daily/archive', sampleDailyArchive)
  await page.goto(`/rugby/${sampleDailyChallenge.number}`)

  await expect(page).toHaveURL('/rugby')
  await expect(page.getByRole('heading', { name: /Daily Challenge/ })).toBeVisible()
})

test("a day the archive cannot give still leads to a game: today's", async ({ page }) => {
  await mockApi(page, '/api/rugby/daily/archive', sampleDailyArchive)
  await page.goto('/rugby/99')

  await expect(page).toHaveURL('/rugby')
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
})

test("a shared link previews as its day's card, indexed under the sport's page", async ({ request }) => {
  const html = await (await request.get('/rugby/7')).text()
  expect(html).toContain('<title>Rugby daily challenge #7 · I Played With</title>')
  expect(html).toContain('<link rel="canonical" href="https://iplayedwith.com/rugby"/>')
  expect(html).toContain('<meta property="og:url" content="https://iplayedwith.com/rugby/7"/>')
  expect(html).toMatch(/<meta property="og:image" content="[^"]*\/rugby\/7\/opengraph-image/)
})

test('the card still renders when the database is down — without the players, briefly cached', async ({ request }) => {
  const card = await request.get('/rugby/7/opengraph-image')
  expect(card.status()).toBe(200)
  expect(card.headers()['content-type']).toBe('image/png')
  expect(card.headers()['cache-control']).toBe('public, max-age=300')
})

test('a link that names no day is not found', async ({ request }) => {
  expect((await request.get('/rugby/abc')).status()).toBe(404)
  expect((await request.get('/rugby/0')).status()).toBe(404)
  expect((await request.get('/tennis/7')).status()).toBe(404)
})
