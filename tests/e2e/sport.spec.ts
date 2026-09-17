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

// Requires 008_search_normalization.sql and 009_seed_club_aliases.sql on top of the
// migrations above.
test.describe('forgiving search', () => {
  type ApiPlayer = { id: string; name: string }
  type ApiClub = { id: string; name: string; matchedAlias?: string }

  /** The de-accented, unpunctuated spelling a player is likely to actually type. */
  const asTyped = (name: string) =>
    name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim()

  test('a name typed without its accents or punctuation still finds the player', async ({ request }) => {
    // Pulled from the live roster rather than hard-coded, so the test does not depend on
    // one particular player surviving a re-seed.
    const sample: ApiPlayer[] = await (await request.get('/api/players?sport=rugby&q=an')).json()
    const accented = sample.find(p => asTyped(p.name) !== p.name)
    test.skip(!accented, 'no accented or punctuated name in this sample to search for')

    const typed = asTyped(accented!.name)
    const res = await request.get(`/api/players?sport=rugby&q=${encodeURIComponent(typed)}`)

    expect(res.ok()).toBe(true)
    const found: ApiPlayer[] = await res.json()
    expect(found.map(p => p.id)).toContain(accented!.id)
  })

  test('a club is found by the name people use, not only its official one', async ({ request }) => {
    const res = await request.get('/api/clubs?sport=rugby&q=la%20roch')
    expect(res.ok()).toBe(true)

    const clubs: ApiClub[] = await res.json()
    const rochelais = clubs.find(c => c.name === 'Stade Rochelais')
    expect(rochelais, 'expected "la roch" to reach the Stade Rochelais via its alias').toBeDefined()
    expect(rochelais!.matchedAlias).toBe('La Rochelle')
  })
})
