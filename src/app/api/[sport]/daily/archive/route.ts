import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { isVisitorId } from '@/domain/dailyResult'
import { getDailyArchive } from '@/services/dailyChallengeService'
import { ValidationError } from '@/services/errors'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * POST /api/:sport/daily/archive  — body `{ visitorId? }`
 *
 * Every daily challenge of the sport up to today, newest first (`DailyArchive`,
 * src/domain/dailyArchive.ts), each with the visitor's result as the server recorded it. Without
 * `visitorId` (a browser without storage), the days alone. Never tomorrow's, already drawn.
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
    const visitorId = body?.visitorId ?? null
    if (visitorId !== null && !isVisitorId(visitorId)) throw new ValidationError('visitorId must be a UUID')

    const archive = await getDailyArchive(supabaseAdmin(), sport, visitorId)
    return NextResponse.json(archive, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
