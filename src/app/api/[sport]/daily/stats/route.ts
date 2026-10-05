import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { isVisitorId } from '@/domain/dailyResult'
import { getDailyStats } from '@/services/dailyResultService'
import { ValidationError } from '@/services/errors'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * POST /api/:sport/daily/stats  — body `{ visitorId }`
 *
 * The visitor's daily stats in the sport (`DailyStats`, src/domain/dailyScore.ts): days played and
 * won, streaks, average score and its distribution — computed from what the server recorded, never
 * from the browser's word. A visitor the server never saw has empty stats.
 *
 * A POST so the visitor id stays out of URLs and logs: whoever has it can rename the visitor.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params
  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'unknown sport' }, { status: 404 })
  }

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!isVisitorId(body?.visitorId)) throw new ValidationError('visitorId must be a UUID')

    const stats = await getDailyStats(supabaseAdmin(), sport, body.visitorId)
    return NextResponse.json(stats, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
