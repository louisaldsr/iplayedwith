import { NextRequest, NextResponse } from 'next/server'
import { parseContactMessage } from '@/domain/contactMessage'
import { sendContactMessage } from '@/services/contactService'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * POST /api/contact  — body `{ name?, email?, message, visitorId?, website? }`
 *
 * Emails the message to the contact address (`src/services/contactService.ts`). Nothing is stored.
 *   204                                 — sent
 *   400 `{ error: 'invalid', problem }` — see `ContactProblem`
 *   502                                 — the email provider refused it
 *   503                                 — no email key on this server
 *
 * `website` is a honeypot: hidden from people, filled in by bots. A filled one is answered 204 as if
 * sent, so the bot learns nothing, and nothing is sent.
 */
export async function POST(req: NextRequest) {
  try {
    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
    if (typeof body.website === 'string' && body.website.trim()) return new NextResponse(null, { status: 204 })

    const parsed = parseContactMessage(body)
    if (!parsed.ok) return NextResponse.json({ error: 'invalid', problem: parsed.problem }, { status: 400 })

    await sendContactMessage(parsed.value)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
