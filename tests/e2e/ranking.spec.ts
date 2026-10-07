import { test, expect, mockApi, asReturningVisitor, sampleDailyChallenge, linkingPlayer, winningMove } from './fixtures'

// The ranking itself is computed by the database (015_daily_results.sql) and checked there. What
// the browser owes it is small: say who it is when it starts the day and with every move.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('starting the daily and every move carry the same anonymous visitor id', async ({ page }) => {
  await asReturningVisitor(page)
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
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

  await page.goto('/rugby')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByPlaceholder('Player…').fill('cha')
  await page.locator('.autocomplete-item', { hasText: 'Charlie Lien' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('heading', { name: 'Congratulations!' })).toBeVisible()

  const visitorId = await page.evaluate(() => window.localStorage.getItem('ipw.playerId'))
  expect(visitorId).toMatch(UUID)
  expect(sent).toEqual([
    { path: '/api/rugby/daily/start', body: { day: sampleDailyChallenge.day, visitorId } },
    { path: '/api/rugby/move', body: expect.objectContaining({ daily: { visitorId } }) },
  ])
})

test.describe('refused before any database access', () => {
  const visitorId = '6f1c2b1e-8a5d-4c1b-9d3e-2f7a1b0c9e11'
  const move = {
    playerAId: 'p-alpha',
    playerBId: 'p-bravo',
    difficulty: 'easy',
    graph: { players: ['p-alpha', 'p-bravo'], clubs: [], edges: [] },
    move: { kind: 'easy', playerId: 'p-charlie' },
  }

  test('a start without a proper visitor id or day', async ({ request }) => {
    const noId = await request.post('/api/rugby/daily/start', { data: { day: '2026-07-15', visitorId: 'me' } })
    expect(noId.status()).toBe(400)
    const noDay = await request.post('/api/rugby/daily/start', { data: { day: 'today', visitorId } })
    expect(noDay.status()).toBe(400)
  })

  test('a ranking asked for with a malformed visitor id', async ({ request }) => {
    const res = await request.post('/api/rugby/daily/ranking', { data: { visitorId: 'me' } })
    expect(res.status()).toBe(400)
  })

  test('a daily move without a proper visitor id, or in hard mode', async ({ request }) => {
    const noId = await request.post('/api/rugby/move', { data: { ...move, daily: { visitorId: 'me' } } })
    expect(noId.status()).toBe(400)
    const hard = await request.post('/api/rugby/move', { data: { ...move, difficulty: 'hard', daily: { visitorId } } })
    expect(hard.status()).toBe(400)
  })
})
