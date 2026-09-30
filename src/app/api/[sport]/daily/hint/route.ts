import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { recordDailyHint } from '@/services/dailyResultService'
import { ValidationError } from '@/services/errors'
import { parseDailyRequest } from '@/lib/dailyRequest'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * POST /api/:sport/daily/hint  — body `{ day, visitorId, playerId }`
 *
 * Records that a visitor opened a player's career during today's challenge — a hint, kept for a
 * future score to reward games solved without. Never refused for being a hint: the career is free.
 * Ignored for A and B, for an unknown player and once the day is over. 409 when `day` is no longer
 * today.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params
  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'unknown sport' }, { status: 404 })
  }

  try {
    const { day, visitorId, raw } = parseDailyRequest(await req.json().catch(() => null))
    if (typeof raw.playerId !== 'string' || raw.playerId === '') throw new ValidationError('playerId is required')

    await recordDailyHint(supabaseAdmin(), sport, day, visitorId, raw.playerId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
