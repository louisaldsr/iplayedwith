import {
  test,
  expect,
  mockApi,
  asReturningVisitor,
  sampleDailyChallenge,
  sampleDailyStats,
  sampleDailyLeaderboard,
  linkingPlayer,
  winningMove,
} from './fixtures'

// The score itself — the extra players — is computed in src/domain/dailyScore.ts and in SQL, and
// tested there. What the page owes it: show it on the results, with the stats under it.

test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
})

test('winning the daily shows the score, the ranking and the stats, today lit', async ({ page }) => {
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/players', [linkingPlayer])
  await mockApi(page, '/api/rugby/daily/start', {})
  await mockApi(page, '/api/rugby/move', winningMove)
  await mockApi(page, '/api/rugby/daily/stats', sampleDailyStats)
  await mockApi(page, '/api/rugby/daily/ranking', sampleDailyLeaderboard())
  await page.goto('/rugby')

  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByPlaceholder('Player…').fill('cha')
  await page.getByText('Charlie Lien').click()
  await page.getByRole('button', { name: 'Submit' }).click()

  const results = page.getByRole('dialog', { name: 'Congratulations!' })
  // One player needed, one added.
  await expect(results.locator('.victory-score__value')).toHaveText('Perfect!')
  await expect(results.getByText('Best solution found')).toBeVisible()
  // The score says it all: only the time and the lives stay next to it.
  await expect(results.getByText('Moves')).toHaveCount(0)
  await expect(results.getByText('Time')).toBeVisible()

  const ranking = results.getByRole('region', { name: "Today's ranking" })
  await expect(ranking.getByRole('list', { name: 'Podium' }).getByRole('listitem')).toHaveCount(3)
  await expect(ranking.getByText('5th / 12')).toBeVisible()

  const stats = results.getByRole('region', { name: 'Your stats' })
  await expect(stats.locator('.daily-stats__bar--today')).toContainText('Perfect')
  await expect(stats.locator('.daily-stats__bar--today')).toContainText('2')
})

test('a lost day shows the ranking and the stats on its finished screen', async ({ page }) => {
  await page.addInitScript(
    (day) => window.localStorage.setItem('ipw.daily.rugby', JSON.stringify({ day, livesLeft: 0, outcome: 'lost' })),
    sampleDailyChallenge.day,
  )
  await mockApi(page, '/api/rugby/daily', sampleDailyChallenge)
  await mockApi(page, '/api/rugby/daily/stats', { ...sampleDailyStats, currentStreak: 0, today: 'lost' })
  await mockApi(page, '/api/rugby/daily/ranking', {
    ...sampleDailyLeaderboard(),
    you: { rank: 4, outcome: 'lost', score: null, durationMs: 90_000 },
  })
  await page.goto('/rugby')

  await expect(page.getByRole('heading', { name: 'Out of lives' })).toBeVisible()
  // A loser's rank — the one every loser shares — never a place on the podium.
  const ranking = page.getByRole('region', { name: "Today's ranking" })
  await expect(ranking.locator('.daily-ranking__place')).toHaveText(/Your rank\s*4th \/ 12/)
  await expect(ranking.locator('.daily-ranking__entry--you')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Your stats' }).locator('.daily-stats__bar--today')).toContainText(
    'Lost',
  )
})
