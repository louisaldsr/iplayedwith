import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { getDailySolution } from '@/services/dailySolutionService'
import { parseDailyRequest } from '@/lib/dailyRequest'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * POST /api/:sport/daily/solution  — body `{ day, visitorId }`
 *
 * The day's stored solution (`DailySolution`, src/domain/dailySolution.ts) — one shortest chain,
 * with the club and season of each link — once the visitor's day is over on the server.
 * 403 while it is not (being played, or never started); 404 for a day without a challenge.
 *
 * A POST so the visitor id stays out of URLs and logs.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params
  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'unknown sport' }, { status: 404 })
  }

  try {
    const { day, visitorId } = parseDailyRequest(await req.json().catch(() => null))
    const solution = await getDailySolution(supabaseAdmin(), sport, day, visitorId)
    return NextResponse.json(solution, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
