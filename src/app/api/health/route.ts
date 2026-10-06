import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ping } from '@/repositories/healthRepository'

/**
 * GET /api/health — for the uptime monitor.
 *
 * `200 { status: 'ok' }` when the site AND its database answer; `503 { status: 'down' }` when the
 * database does not (a page that loads with a dead database still cannot play a move). Says nothing
 * else: the failure is only logged.
 */
export async function GET() {
  const noStore = { 'Cache-Control': 'no-store' }
  try {
    await ping(supabase)
    return NextResponse.json({ status: 'ok' }, { headers: noStore })
  } catch (err) {
    console.error('health check: database unreachable', err)
    return NextResponse.json({ status: 'down' }, { status: 503, headers: noStore })
  }
}

// Never cached, never prerendered: every call checks again.
export const dynamic = 'force-dynamic'
