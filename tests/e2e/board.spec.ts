import { Page } from '@playwright/test'
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

/** Plays every guess on today's daily, as the server would accept them. */
async function growBoard(page: Page) {
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
}

for (const { name, viewport } of [
  { name: 'phone', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
]) {
  test(`cards never cover one another — ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await growBoard(page)

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

// The board is a whiteboard: dragged with one finger, pinched with two, scrolled and zoomed with the
// wheel — the page under it never moves.
test.describe('the board as a whiteboard', () => {
  const alpha = (page: Page) => page.locator('.node-card', { hasText: 'Alpha Testeur' })
  const box = async (page: Page) => (await page.locator('.game-screen-board .game-board').boundingBox())!

  /** Two touch pointers, as a browser sends them: down together, apart (or together), up. */
  async function pinch(page: Page, centre: { x: number; y: number }, from: number, to: number) {
    await page.locator('.game-screen-board .game-board').evaluate(
      (el, { centre, from, to }) => {
        const send = (type: string, id: number, x: number) =>
          el.dispatchEvent(
            new PointerEvent(type, {
              pointerId: id,
              pointerType: 'touch',
              isPrimary: id === 1,
              clientX: x,
              clientY: centre.y,
              bubbles: true,
            }),
          )
        send('pointerdown', 1, centre.x - from / 2)
        send('pointerdown', 2, centre.x + from / 2)
        for (let step = 1; step <= 5; step++) {
          const gap = from + ((to - from) * step) / 5
          send('pointermove', 1, centre.x - gap / 2)
          send('pointermove', 2, centre.x + gap / 2)
        }
        send('pointerup', 1, centre.x - to / 2)
        send('pointerup', 2, centre.x + to / 2)
      },
      { centre, from, to },
    )
  }

  test('a phone: one finger drags it, two pinch it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await growBoard(page)
    const before = (await alpha(page).boundingBox())!
    expect(before.width).toBeGreaterThanOrEqual(116 * 0.7 - 1)

    // Beside the cards, a drag down slides the board down.
    const b = await box(page)
    await page.mouse.move(b.x + 6, b.y + 200)
    await page.mouse.down()
    await page.mouse.move(b.x + 6, b.y + 300, { steps: 6 })
    await page.mouse.up()
    const dragged = (await alpha(page).boundingBox())!
    expect(dragged.y).toBeGreaterThan(before.y + 80)

    // Fingers apart: the cards grow.
    await pinch(page, { x: b.x + b.width / 2, y: b.y + 150 }, 80, 200)
    const pinched = (await alpha(page).boundingBox())!
    expect(pinched.width).toBeGreaterThan(dragged.width * 1.8)

    // Fingers together: smaller again.
    await pinch(page, { x: b.x + b.width / 2, y: b.y + 150 }, 200, 80)
    expect((await alpha(page).boundingBox())!.width).toBeCloseTo(dragged.width, 0)
  })

  test('a computer: the wheel scrolls it, Ctrl + wheel zooms it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await growBoard(page)
    const before = (await alpha(page).boundingBox())!
    const b = await box(page)

    await page.mouse.move(b.x + b.width / 2, b.y + 40)
    await page.mouse.wheel(0, 120)
    const scrolled = (await alpha(page).boundingBox())!
    expect(scrolled.y).toBeCloseTo(before.y - 120, 0)
    expect(scrolled.width).toBeCloseTo(before.width, 0)

    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    expect((await alpha(page).boundingBox())!.width).toBeGreaterThan(before.width * 1.5)
  })
})
