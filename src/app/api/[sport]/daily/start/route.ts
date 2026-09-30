import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { ChallengeDay } from '@/domain/dailyChallenge'
import { isVisitorId } from '@/domain/dailyResult'
import { startDailyResult } from '@/services/dailyResultService'
import { ValidationError } from '@/services/errors'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * POST /api/:sport/daily/start  — body `{ day, visitorId }`
 *
 * Stamps the moment a visitor starts the day's challenge: the ranking's time counts from here, on
 * the server's clock. Idempotent — starting again (another tab, a resumed board) keeps the first
 * time. 409 when `day` is no longer today.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params
  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'unknown sport' }, { status: 404 })
  }

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!isVisitorId(body?.visitorId)) throw new ValidationError('visitorId must be a UUID')
    let day: ChallengeDay
    try {
      day = ChallengeDay(String(body?.day))
    } catch {
      throw new ValidationError('day must be a YYYY-MM-DD date')
    }

    await startDailyResult(supabaseAdmin(), sport, day, body.visitorId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
