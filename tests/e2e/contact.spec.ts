import { test, expect, asReturningVisitor } from './fixtures'

// The email itself is the server's job (tests/unit/app/contact.test.ts): here `/api/contact` is mocked.

async function mockContact(page: import('@playwright/test').Page, response: { status: number; json?: unknown }) {
  const sent: Record<string, unknown>[] = []
  await page.route(
    (url) => url.pathname === '/api/contact',
    (route) => {
      sent.push(route.request().postDataJSON())
      return route.fulfill(response.status === 204 ? { status: 204 } : { status: response.status, json: response.json })
    },
  )
  return sent
}

/** The contact form's own fields — the rules demo, mounted on every page, has labels of its own. */
const contact = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Contact' })
const nameField = (page: import('@playwright/test').Page) => contact(page).getByRole('textbox', { name: /^Name/ })
const emailField = (page: import('@playwright/test').Page) =>
  contact(page).getByRole('textbox', { name: /^Your email/ })
const messageField = (page: import('@playwright/test').Page) => contact(page).getByRole('textbox', { name: 'Message' })

test.beforeEach(async ({ page }) => {
  await asReturningVisitor(page)
})

test('the contact address is in plain sight, as a mail link', async ({ page }) => {
  await page.goto('/about')
  const section = page.getByRole('region', { name: 'Contact' })
  await expect(section.getByRole('link', { name: 'contact@iplayedwith.com' })).toHaveAttribute(
    'href',
    'mailto:contact@iplayedwith.com',
  )
  await expect(section.getByRole('button', { name: 'Copy the address' })).toBeVisible()
})

test('a message is sent, with the visitor id, and the form says so', async ({ page }) => {
  const sent = await mockContact(page, { status: 204 })
  await page.goto('/about')

  await nameField(page).fill('Louis')
  await emailField(page).fill('louis@example.com')
  await messageField(page).fill('Bayonne is missing in 2015-2016.')
  await contact(page).getByRole('button', { name: 'Send', exact: true }).click()

  await expect(contact(page).getByRole('status')).toContainText('Message sent, thank you!')
  const playerId = await page.evaluate(() => window.localStorage.getItem('ipw.playerId'))
  expect(sent).toEqual([
    {
      name: 'Louis',
      email: 'louis@example.com',
      message: 'Bayonne is missing in 2015-2016.',
      visitorId: playerId,
      website: '',
    },
  ])

  await page.getByRole('button', { name: 'Send another message' }).click()
  await expect(messageField(page)).toHaveValue('')
})

test('a message breaking the rules is caught before any request', async ({ page }) => {
  const sent = await mockContact(page, { status: 204 })
  await page.goto('/about')

  await messageField(page).fill('hi')
  await contact(page).getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('A little short: 10 characters at least.')).toBeVisible()
  await expect(messageField(page)).toHaveAttribute('aria-invalid', 'true')

  await messageField(page).fill('A message long enough')
  await emailField(page).fill('not an email')
  await contact(page).getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('This email does not look right.')).toBeVisible()

  expect(sent).toEqual([])
})

test('when the send fails, the form keeps the message and points to the address', async ({ page }) => {
  await mockContact(page, { status: 502, json: { error: 'the email could not be sent' } })
  await page.goto('/about')

  await messageField(page).fill('Bayonne is missing in 2015-2016.')
  await contact(page).getByRole('button', { name: 'Send', exact: true }).click()

  const alert = contact(page).getByRole('alert')
  await expect(alert).toContainText('The message could not be sent. Write directly to')
  await expect(alert.getByRole('link', { name: 'contact@iplayedwith.com' })).toBeVisible()
  await expect(messageField(page)).toHaveValue('Bayonne is missing in 2015-2016.')
})
