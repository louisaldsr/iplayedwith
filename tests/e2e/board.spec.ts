import { test, expect, mockApi, asReturningVisitor, sampleDailyChallenge } from './fixtures'

// The board grows move by move: each card must land in a free spot, on the board, never on top of
// another — on a phone too, where every card past the first few used to pile up in one corner and A
// and B overlapped.

/** Each guess links to one card already on the board — `p-alpha` is A, `p-bravo` is B. */
const guesses = [
  { id: 'p1', name: 'Romain Ntamack', with: 'p-alpha' },
  { id: 'p2', name: 'Grégory Alldritt', with: 'p-alpha' },
  { id: 'p3', name: 'Cyril Baille', with: 'p1' },
  { id: 'p4', name: 'Siya Kolisi', with: 'p-bravo' },
  { id: 'p5', name: 'Eben Etzebeth', with: 'p-bravo' },
  { id: 'p6', name: 'Cheslin Kolbe', with: 'p4' },
  { id: 'p7', name: 'Thomas Ramos', with: 'p3' },
  { id: 'p8', name: 'Matthieu Jalibert', with: 'p-alpha' },
]

const asPlayer = (g: (typeof guesses)[number]) => ({ id: g.id, name: g.name, sport: 'rugby', fameFloor: 2 })

for (const { name, viewport } of [
  { name: 'phone', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
]) {
  test(`cards never cover one another — ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await asReturningVisitor(page)
    await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
    await mockApi(page, '/api/rugby/daily/start', {})
    await page.route(
      (url) => url.pathname === '/api/players',
      (route) => {
        const q = new URL(route.request().url()).searchParams.get('q') ?? ''
        const hits = guesses.filter((g) => g.name.toLowerCase().startsWith(q.toLowerCase()))
        return route.fulfill({ json: hits.map(asPlayer) })
      },
    )
    let moves = 0
    await page.route(
      (url) => url.pathname === '/api/rugby/move',
      (route) => {
        const g = guesses[moves++]
        const club = { id: `c-${g.id}`, name: `Club ${g.id}`, sport: 'rugby' }
        return route.fulfill({
          json: {
            ok: true,
            node: { kind: 'player', player: asPlayer(g) },
            edges: [
              { playerId: g.id, clubId: club.id, season: '2016-2017' },
              { playerId: g.with, clubId: club.id, season: '2016-2017' },
            ],
            clubs: [club],
            victory: false,
            path: [],
          },
        })
      },
    )

    await page.goto('/rugby')
    await page.getByRole('button', { name: 'Start' }).click()
    for (const g of guesses) {
      await page.getByPlaceholder('Player…').fill(g.name.slice(0, 5))
      await page.getByRole('option', { name: g.name }).click()
      await page.getByRole('button', { name: 'Submit' }).click()
      await expect(page.locator('.node-card', { hasText: g.name })).toBeVisible()
    }

    const board = (await page.locator('.game-screen-board .game-board').boundingBox())!
    const cards = await page.locator('.game-screen-board .node-card').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { label: el.textContent, x: r.x, y: r.y, w: r.width, h: r.height }
      }),
    )
    expect(cards).toHaveLength(guesses.length + 2)

    for (const c of cards) {
      expect(c.x, `${c.label} inside the board`).toBeGreaterThanOrEqual(board.x)
      expect(c.y, `${c.label} inside the board`).toBeGreaterThanOrEqual(board.y)
      expect(c.x + c.w, `${c.label} inside the board`).toBeLessThanOrEqual(board.x + board.width)
      expect(c.y + c.h, `${c.label} inside the board`).toBeLessThanOrEqual(board.y + board.height)
    }
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const [p, q] = [cards[i], cards[j]]
        const overlaps = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h
        expect(overlaps, `${p.label} / ${q.label}`).toBe(false)
      }
    }

    // The chain runs along the board's long side: A to B, left to right — or top to bottom on a phone.
    const a = (await page.locator('.node-card', { hasText: 'Alpha Testeur' }).boundingBox())!
    const b = (await page.locator('.node-card', { hasText: 'Bravo Éssai' }).boundingBox())!
    if (name === 'phone') expect(a.y + a.height).toBeLessThan(b.y)
    else expect(a.x + a.width).toBeLessThan(b.x)
  })
}
