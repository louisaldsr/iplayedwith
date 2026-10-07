import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { isVisitorId } from '@/domain/dailyResult'
import { ChallengeDay } from '@/domain/dailyChallenge'
import { getDailyLeaderboard } from '@/services/dailyResultService'
import { ValidationError } from '@/services/errors'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * POST /api/:sport/daily/ranking  — body `{ visitorId?, day? }`
 *
 * A day's leaderboard (`DailyLeaderboard`, src/domain/dailyLeaderboard.ts) — today's, or with `day` a
 * past one from the archive (409 for a future day): the first three winners and the visitor's own
 * place among everyone who finished. Without a visitor id, the podium alone.
 * Never another visitor's id, never a winning chain.
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
    const day = parseDay(body?.day)

    const leaderboard = await getDailyLeaderboard(supabaseAdmin(), sport, visitorId, day)
    return NextResponse.json(leaderboard, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return toErrorResponse(err)
  }
}

function parseDay(raw: unknown): ChallengeDay | undefined {
  if (raw === undefined || raw === null) return undefined
  try {
    return ChallengeDay(String(raw))
  } catch {
    throw new ValidationError('day must be a YYYY-MM-DD date')
  }
}
