import { test, expect } from '@playwright/test'

test('home page shows the main heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('I Played With')
})

test('home page has the correct document title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/I Played With/)
})
