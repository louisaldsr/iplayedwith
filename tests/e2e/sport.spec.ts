import { test, expect } from '@playwright/test'

// These specs exercise the sport-scoped data flow and require the `006_sport_space.sql`
// migration to be applied and the seed scripts (`npm run seed:*`) to have run against the
// target Supabase instance first.

test.describe('sport setup screen', () => {
  for (const sport of ['rugby', 'football'] as const) {
    test(`${sport} setup screen renders without loading a dataset`, async ({ page }) => {
      const dataRequests: string[] = []
      page.on('request', req => {
        if (req.url().includes('/api/')) dataRequests.push(req.url())
      })

      await page.goto(`/${sport}`)
      await expect(page.getByPlaceholder('Search a player…').first()).toBeVisible()

      // The point of the server-side engine: the setup screen needs no data at all.
      // Before, this page pulled every player, club and membership for the sport.
      expect(dataRequests).toHaveLength(0)
    })
  }

  test('the endpoint that shipped the whole graph is gone', async ({ request }) => {
    const res = await request.get('/api/memberships?sport=rugby')
    expect(res.status()).toBe(404)
  })

  test('player search is server-side and bounded', async ({ page }) => {
    await page.goto('/rugby')

    const search = page.waitForResponse(r => r.url().includes('/api/players?') && r.ok())
    await page.getByPlaceholder('Search a player…').first().fill('dup')

    const players = await (await search).json()
    expect(Array.isArray(players)).toBe(true)
    expect(players.length).toBeLessThanOrEqual(20)
  })

  test('listing players without a query is refused', async ({ request }) => {
    const res = await request.get('/api/players?sport=rugby')
    expect(res.status()).toBe(400)
  })
})
