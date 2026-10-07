import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { startDailyResult } from '@/services/dailyResultService'
import { parseDailyRequest } from '@/lib/dailyRequest'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * POST /api/:sport/daily/start  — body `{ day, visitorId }`
 *
 * Stamps the moment a visitor starts a day's challenge — today's, or a past one from the archive:
 * the ranking's time counts from here, on the server's clock, and a Start after the day marks the
 * result late. Idempotent — starting again (another tab, a resumed board) keeps the first time.
 * 409 for a future day.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params
  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'unknown sport' }, { status: 404 })
  }

  try {
    const { day, visitorId } = parseDailyRequest(await req.json().catch(() => null))
    await startDailyResult(supabaseAdmin(), sport, day, visitorId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
