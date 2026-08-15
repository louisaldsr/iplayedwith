import { test, expect } from '@playwright/test'

test('home page shows the main heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('I Played With')
})

test('home page has the correct document title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/I Played With/)
})

test('home page offers a Rugby and a Football sport link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Rugby' })).toHaveAttribute('href', '/rugby')
  await expect(page.getByRole('link', { name: 'Football' })).toHaveAttribute('href', '/football')
})

test('clicking a sport navigates to its route', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Rugby' }).click()
  await expect(page).toHaveURL('/rugby')
})

test('an unknown sport in the URL 404s', async ({ page }) => {
  const response = await page.goto('/basketball')
  expect(response?.status()).toBe(404)
})
