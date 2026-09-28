import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { getDailyChallenge } from '@/services/dailyChallengeService'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * GET /api/:sport/daily
 *
 * Today's pair for the sport — the same for every visitor, drawn by the day's first request.
 * Returns `{ sport, day, number, playerA, playerB, optimalLinks }`; the stored solution never leaves
 * the server.
 *
 * Uses the service_role client: `daily_challenges` is closed to the public key precisely so
 * the solution cannot be read with it.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params
  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'unknown sport' }, { status: 404 })
  }

  try {
    const challenge = await getDailyChallenge(supabaseAdmin(), sport)
    return NextResponse.json(challenge, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
