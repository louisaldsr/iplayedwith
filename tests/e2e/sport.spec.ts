import { test, expect } from '@playwright/test'

// These specs exercise the sport-scoped data flow and require the
// `003_add_sport.sql` migration to be applied and `npm run db:import` to
// have run against the target Supabase instance first.

test('rugby setup screen loads real player data', async ({ page }) => {
  await page.goto('/rugby')
  await expect(page.getByPlaceholder('Search a player…').first()).toBeVisible()
})

test('football setup screen shows the empty state', async ({ page }) => {
  await page.goto('/football')
  await expect(page.getByText('No players available yet for this sport')).toBeVisible()
})
