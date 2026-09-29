import { test, expect, asReturningVisitor } from './fixtures'

// Every Playwright test starts in a fresh browser context — empty localStorage, i.e. a first visit.

test('a first visit opens the rules, once', async ({ page }) => {
  await page.goto('/')
  const rules = page.getByRole('dialog', { name: 'How to play' })
  await expect(rules).toBeVisible()

  await rules.getByRole('button', { name: "Let's play" }).click()
  await expect(rules).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(rules).toBeHidden()
})

test('a first visit landing straight on a game page opens the rules there', async ({ page }) => {
  await page.goto('/rugby/free')
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible()
})

test('Escape closes the rules and counts as read', async ({ page }) => {
  await page.goto('/')
  const rules = page.getByRole('dialog', { name: 'How to play' })
  await expect(rules).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(rules).toBeHidden()

  await page.goto('/rugby/free')
  await expect(rules).toBeHidden()
})

test('the "?" button reopens the rules from any page', async ({ page }) => {
  await asReturningVisitor(page)
  await page.goto('/rugby/free')
  const rules = page.getByRole('dialog', { name: 'How to play' })
  await expect(rules).toBeHidden()

  await page.getByRole('button', { name: 'How to play' }).click()
  await expect(rules).toBeVisible()
})

test('the back-office has no rules pop-up', async ({ page }) => {
  await page.goto('/admin/login')
  await expect(page.getByRole('button', { name: 'How to play' })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
