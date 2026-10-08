/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/contact/route'

// Resend is never reached: `fetch` is mocked, and the key is a fake one set per test.
const fetchMock = jest.fn()
const post = (body: unknown) =>
  POST(new NextRequest('https://iplayedwith.com/api/contact', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response('{"id":"x"}', { status: 200 }))
  global.fetch = fetchMock
  process.env.RESEND_API_KEY = 're_test'
})
afterEach(() => {
  delete process.env.RESEND_API_KEY
  jest.restoreAllMocks()
})

describe('POST /api/contact', () => {
  it('emails the message to the contact address, the sender as Reply-To', async () => {
    const res = await post({ name: 'Louis', email: 'a@b.fr', message: 'Le club de Bayonne manque en 2015' })

    expect(res.status).toBe(204)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer re_test')
    const sent = JSON.parse(init.body)
    expect(sent).toMatchObject({
      to: ['contact@iplayedwith.com'],
      reply_to: 'a@b.fr',
      subject: '[I Played With] Message from Louis',
    })
    expect(sent.from).toMatch(/@iplayedwith\.com>$/)
    expect(sent.text).toContain('Le club de Bayonne manque en 2015')
  })

  it('without an email, sends with no Reply-To', async () => {
    await post({ message: 'Le club de Bayonne manque en 2015' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('reply_to')
  })

  it('refuses an invalid message before sending anything', async () => {
    const res = await post({ message: 'court' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid', problem: 'message-too-short' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers a filled honeypot as if sent, and sends nothing', async () => {
    const res = await post({ message: 'Buy cheap watches now', website: 'https://spam.example' })
    expect(res.status).toBe(204)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is 502 when Resend refuses, 503 without a key', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockResolvedValueOnce(new Response('{"message":"bad"}', { status: 422 }))
    expect((await post({ message: 'Le club de Bayonne manque' })).status).toBe(502)

    delete process.env.RESEND_API_KEY
    expect((await post({ message: 'Le club de Bayonne manque' })).status).toBe(503)
  })
})
