/**
 * A message sent from the contact form on /about — checked the same way by the form and by the
 * server (`POST /api/contact`), which emails it to the contact address. Nothing is stored.
 *
 * Only the message is required: a visitor may write without leaving an address, at the cost of no
 * answer. Name and email never hold a line break — they end up in the email's subject and Reply-To.
 */

export const CONTACT_LIMITS = {
  name: 60,
  email: 254,
  message: { min: 10, max: 3000 },
} as const

export type ContactMessage = {
  name: string | null
  email: string | null
  message: string
  /** The sender's anonymous visitor id, when the browser has one — to look up its results. */
  visitorId: string | null
}

export type ContactProblem = 'message-too-short' | 'message-too-long' | 'email' | 'name-too-long'

export type ParsedContact = { ok: true; value: ContactMessage } | { ok: false; problem: ContactProblem }

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A trimmed single line, or null when empty. Inner whitespace runs (line breaks included) become one space. */
function oneLine(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const line = raw.replace(/\s+/g, ' ').trim()
  return line || null
}

export function parseContactMessage(raw: {
  name?: unknown
  email?: unknown
  message?: unknown
  visitorId?: unknown
}): ParsedContact {
  const message = typeof raw.message === 'string' ? raw.message.trim() : ''
  if (message.length < CONTACT_LIMITS.message.min) return { ok: false, problem: 'message-too-short' }
  if (message.length > CONTACT_LIMITS.message.max) return { ok: false, problem: 'message-too-long' }

  const name = oneLine(raw.name)
  if (name && name.length > CONTACT_LIMITS.name) return { ok: false, problem: 'name-too-long' }

  const email = oneLine(raw.email)
  if (email && (email.length > CONTACT_LIMITS.email || !EMAIL_REGEX.test(email))) {
    return { ok: false, problem: 'email' }
  }

  const visitorId = typeof raw.visitorId === 'string' && UUID_REGEX.test(raw.visitorId) ? raw.visitorId : null
  return { ok: true, value: { name, email, message, visitorId } }
}
