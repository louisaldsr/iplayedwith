import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isVisitorId } from '@/domain/dailyResult'
import { findUsername, renameVisitor } from '@/services/visitorService'
import { ValidationError } from '@/services/errors'
import { toErrorResponse } from '@/lib/apiErrors'
import { setVisitorCookie } from '@/lib/visitorCookie'

/**
 * POST /api/visitor  — body `{ visitorId }`
 *
 * The visitor's username `{ username }`, or `{ username: null }` for a visitor that never started a
 * daily challenge. **Never creates one**: a visitor is registered by its first Start
 * (`POST /api/:sport/daily/start`), so a browser that only looks around leaves no row — and a script
 * minting ids here writes nothing. The client formats the name (`formatUsername`) and caches it.
 * A registered visitor also gets the visitor cookie (`src/lib/visitorCookie.ts`), the copy of the id
 * that survives Safari's storage purge.
 *
 * A POST, to keep the id out of URLs and logs: whoever knows it can rename the visitor.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!isVisitorId(body?.visitorId)) throw new ValidationError('visitorId must be a UUID')

    const username = await findUsername(supabaseAdmin(), body.visitorId)
    const res = NextResponse.json({ username }, { headers: { 'Cache-Control': 'no-store' } })
    if (username) setVisitorCookie(res, req.nextUrl, body.visitorId)
    return res
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * PATCH /api/visitor  — body `{ visitorId, username }`
 *
 * Renames the visitor — the menu's badge. Answers:
 *   200 `{ username }`                    — renamed, to the name as stored (trimmed)
 *   400 `{ error: 'invalid', problem }`   — too short, too long, or characters not allowed
 *   409 `{ error: 'taken', suggestions }` — someone has it (compared normalized); free variants
 *   404                                   — a visitor the server never saw
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!isVisitorId(body?.visitorId)) throw new ValidationError('visitorId must be a UUID')
    if (typeof body.username !== 'string') throw new ValidationError('username must be a string')

    const result = await renameVisitor(supabaseAdmin(), body.visitorId, body.username)
    const noStore = { 'Cache-Control': 'no-store' }
    switch (result.status) {
      case 'renamed':
        return NextResponse.json({ username: result.username }, { headers: noStore })
      case 'invalid':
        return NextResponse.json({ error: 'invalid', problem: result.problem }, { status: 400, headers: noStore })
      case 'taken':
        return NextResponse.json({ error: 'taken', suggestions: result.suggestions }, { status: 409, headers: noStore })
    }
  } catch (err) {
    return toErrorResponse(err)
  }
}
