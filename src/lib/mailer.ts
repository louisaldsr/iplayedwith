import { ServiceError } from '@/services/errors'

/**
 * Sends an email through Resend's HTTP API — a single `fetch`, no SDK. Server only: the key
 * (`RESEND_API_KEY`) never reaches the browser.
 *
 * The sender must be on a domain verified in Resend (`iplayedwith.com`: DKIM + SPF records on the
 * `send.` subdomain, in Vercel DNS).
 */

const RESEND_URL = 'https://api.resend.com/emails'

export type Email = {
  from: string
  to: string
  subject: string
  text: string
  replyTo?: string
}

export async function sendEmail(email: Email, signal?: AbortSignal): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new ServiceError('email is not configured', 503)

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
    signal: signal ?? AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    console.error(`Resend refused the email: ${res.status} ${await res.text().catch(() => '')}`)
    throw new ServiceError('the email could not be sent', 502)
  }
}
