import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isVisitorId } from '@/domain/dailyResult'
import { ensureVisitorName } from '@/services/visitorService'
import { ValidationError } from '@/services/errors'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * POST /api/visitor  — body `{ visitorId }`
 *
 * The visitor's generated name `{ adjective, noun, number }` — created on first call, the same on
 * every later one. The menu shows it; the browser caches it, so this runs about once per browser.
 *
 * A POST, since the first call creates the visitor.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!isVisitorId(body?.visitorId)) throw new ValidationError('visitorId must be a UUID')

    const name = await ensureVisitorName(supabaseAdmin(), body.visitorId)
    return NextResponse.json(name, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
