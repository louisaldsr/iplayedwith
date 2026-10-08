import { test, expect } from './fixtures'

// What search engines and the uptime monitor read — answered by the server without the database,
// except the health check, which reports the e2e server's unreachable database honestly.

test('robots.txt opens the game, closes the back-office and the API, and points to the sitemap', async ({
  request,
}) => {
  const body = await (await request.get('/robots.txt')).text()
  expect(body).toContain('Allow: /')
  expect(body).toContain('Disallow: /admin')
  expect(body).toContain('Disallow: /api')
  expect(body).toContain('Sitemap: https://iplayedwith.com/sitemap.xml')
})

test('the sitemap lists the public pages on the real domain', async ({ request }) => {
  const body = await (await request.get('/sitemap.xml')).text()
  for (const path of ['', '/rugby', '/rugby/free', '/football', '/football/free', '/about']) {
    expect(body).toContain(`<loc>https://iplayedwith.com${path}</loc>`)
  }
})

test('the home page tells search engines its name, its canonical address and what it is', async ({ request }) => {
  const html = await (await request.get('/')).text()
  expect(html).toContain(
    '<title>I Played With — the teammates game for rugby, football, basketball, and Formula 1</title>',
  )
  expect(html).toContain('<link rel="canonical" href="https://iplayedwith.com"/>')
  expect(html).toContain('<meta property="og:url" content="https://iplayedwith.com"/>')
  expect(html).toContain('"@type":"WebSite"')
  expect(html).toContain('"alternateName":["IPlayedWith","iplayedwith"]')
})

test("each sport's daily page has its own title and canonical", async ({ request }) => {
  const html = await (await request.get('/rugby')).text()
  expect(html).toContain('<title>Rugby daily challenge · I Played With</title>')
  expect(html).toContain('<link rel="canonical" href="https://iplayedwith.com/rugby"/>')
})

test('the back-office is never indexed', async ({ request }) => {
  const html = await (await request.get('/admin/login')).text()
  expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>')
})

test('the health check says "down" when the database does not answer', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(503)
  expect(await res.json()).toEqual({ status: 'down' })
  expect(res.headers()['cache-control']).toContain('no-store')
})
