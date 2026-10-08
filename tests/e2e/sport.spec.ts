import {
  test,
  expect,
  mockApi,
  asReturningVisitor,
  samplePlayers,
  sampleDailyChallenge,
  sampleCareer,
  linkingPlayer,
  winningMove,
} from './fixtures'

// No database behind any of these: page requests are mocked (see fixtures.ts), and the `request`
// calls only reach answers the server gives before touching the database — unknown routes and
// input validation. What the database itself returns (search ranking, accent folding, the daily
// draw) is covered by the unit tests and the post-apply checks of each migration.

test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
})

test.describe('free-play setup screen', () => {
  for (const sport of ['rugby', 'football', 'basketball', 'formula1'] as const) {
    test(`${sport} setup screen renders without loading a dataset`, async ({ page }) => {
      await page.goto(`/${sport}/free`)
      await expect(page.getByPlaceholder(/Search a (player|driver)…/).first()).toBeVisible()

      // The point of the server-side engine: the setup screen needs no data at all. Before, this
      // page pulled every player, club and membership for the sport. Any call would fail the
      // fixture's unmocked-API guard.
    })
  }

  test('Formula 1 speaks of drivers and constructors; the other sports keep players and clubs', async ({ page }) => {
    await page.goto('/formula1/free')
    await expect(page.getByRole('heading', { name: 'Choose Your Drivers' })).toBeVisible()
    await expect(page.getByPlaceholder('Search a driver…').first()).toBeVisible()
    await expect(page.getByText('Driver + Constructor + Season')).toBeVisible()

    await page.goto('/rugby/free')
    await expect(page.getByRole('heading', { name: 'Choose Your Players' })).toBeVisible()
    await expect(page.getByText('Player + Club + Season')).toBeVisible()
  })

  test('player search is asked of the server, scoped to the sport', async ({ page }) => {
    const calls = await mockApi(page, '/api/players', samplePlayers)
    await page.goto('/rugby/free')

    await page.getByPlaceholder('Search a player…').first().fill('alp')

    await expect(page.getByText('Alpha Testeur')).toBeVisible()
    const last = calls.at(-1)!
    expect(last.searchParams.get('sport')).toBe('rugby')
    expect(last.searchParams.get('q')).toBe('alp')
  })

  test('the endpoint that shipped the whole graph is gone', async ({ request }) => {
    const res = await request.get('/api/memberships?sport=rugby')
    expect(res.status()).toBe(404)
  })

  test('listing players without a query is refused', async ({ request }) => {
    const res = await request.get('/api/players?sport=rugby')
    expect(res.status()).toBe(400)
  })
})

test.describe('daily challenge', () => {
  test("the sport page opens on the day's pair, then offers free play and the past challenges", async ({ page }) => {
    await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
    await page.goto('/rugby')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('#7')
    await expect(page.getByRole('button', { name: /Alpha Testeur/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Bravo Éssai/ })).toBeVisible()
    await expect(page.getByText('Best solution: 1 player in between')).toBeVisible()
    const more = page.getByRole('navigation', { name: 'Other ways to play' })
    await expect(more.getByRole('link', { name: /Free play/ })).toHaveAttribute('href', '/rugby/free')
    await expect(more.getByRole('link', { name: /Past challenges/ })).toHaveAttribute('href', '/rugby/archive')
  })

  test("a Formula 1 daily speaks of drivers, and a driver's career reads in calendar seasons", async ({ page }) => {
    await mockApi(page, '/api/formula1/daily', { ...sampleDailyChallenge, sport: 'formula1' })
    await mockApi(page, '/api/players/p-alpha/career', {
      player: samplePlayers[0],
      stints: [
        { club: { id: 'c-mclaren', name: 'McLaren', sport: 'formula1' }, from: '2019', to: '2021', games: 60 },
        { club: { id: 'c-ferrari', name: 'Ferrari', sport: 'formula1' }, from: '2022', to: '2022', games: 22 },
      ],
    })
    await page.goto('/formula1')

    await expect(page.getByText('Best solution: 1 driver in between')).toBeVisible()
    await page.getByRole('button', { name: /Alpha Testeur/ }).click()
    const career = page.getByRole('dialog', { name: 'Alpha Testeur' })
    await expect(career.getByText('2019 – 2021')).toBeVisible()
    await expect(career.getByText('60 races')).toBeVisible()
    // One calendar season is one year, not "2022 – 2022".
    await expect(career.getByText('2022', { exact: true })).toBeVisible()
  })

  test('a player of the pair opens their career, club by club', async ({ page }) => {
    await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
    const calls = await mockApi(page, '/api/players/p-alpha/career', sampleCareer)
    await page.goto('/rugby')

    await page.getByRole('button', { name: /Alpha Testeur/ }).click()

    const career = page.getByRole('dialog', { name: 'Alpha Testeur' })
    await expect(career).toBeVisible()
    await expect(career.getByText('2015 – 2019')).toBeVisible()
    await expect(career.getByText('Club Un')).toBeVisible()
    await expect(career.getByText('64 games')).toBeVisible()
    await expect(career.getByText('Club Deux')).toBeVisible()
    expect(calls).toHaveLength(1)

    await career.getByRole('button', { name: 'Close' }).click()
    await expect(career).toBeHidden()
  })

  test('winning the daily marks the sport as done in the menu', async ({ page }) => {
    await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
    await mockApi(page, '/api/players', [linkingPlayer])
    await mockApi(page, '/api/rugby/daily/start', {})
    await mockApi(page, '/api/rugby/move', winningMove)
    await page.goto('/rugby')

    await page.getByRole('button', { name: 'Start' }).click()
    await page.getByPlaceholder('Player…').fill('cha')
    await page.getByText('Charlie Lien').click()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByRole('heading', { name: 'Congratulations!' })).toBeVisible()

    await page.getByRole('button', { name: 'See the board' }).click()
    await page.getByRole('link', { name: 'Menu' }).click()
    await expect(page.getByRole('link', { name: 'Rugby — Daily challenge (done today)' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Football — Daily challenge', exact: true })).toBeVisible()
  })

  test('a move can be played from the keyboard alone', async ({ page }) => {
    await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
    await mockApi(page, '/api/players', [linkingPlayer])
    await mockApi(page, '/api/rugby/daily/start', {})
    const moves = await mockApi(page, '/api/rugby/move', winningMove)
    await page.goto('/rugby')

    await page.getByRole('button', { name: 'Start' }).click()
    const field = page.getByPlaceholder('Player…')
    await field.fill('cha')
    await expect(page.getByRole('option', { name: 'Charlie Lien' })).toBeVisible()

    // Down + Enter picks the row; the chip takes the focus.
    await field.press('ArrowDown')
    await expect(page.getByRole('option', { name: 'Charlie Lien' })).toHaveAttribute('aria-selected', 'true')
    await field.press('Enter')
    const chip = page.locator('.input-chip', { hasText: 'Charlie Lien' })
    await expect(chip).toBeFocused()

    // Escape drops the pick and gives the field back.
    await chip.press('Escape')
    await expect(chip).toHaveCount(0)
    await expect(field).toBeFocused()
    expect(moves).toHaveLength(0)

    // Enter on the chip plays it.
    await field.fill('cha')
    await expect(page.getByRole('option', { name: 'Charlie Lien' })).toBeVisible()
    await field.press('ArrowDown')
    await field.press('Enter')
    await chip.press('Enter')
    await expect(page.getByRole('heading', { name: 'Congratulations!' })).toBeVisible()
    expect(moves).toHaveLength(1)
  })

  test('a failed load shows an error instead of an empty board', async ({ page }) => {
    await page.route('**/api/rugby/daily', (route) => route.fulfill({ status: 500, json: { error: 'down' } }))
    await page.goto('/rugby')

    await expect(page.getByText('Something went wrong')).toBeVisible()
  })

  test('an unknown sport is refused', async ({ request }) => {
    const res = await request.get('/api/curling/daily')
    expect(res.status()).toBe(404)
  })
})
