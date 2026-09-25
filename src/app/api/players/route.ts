import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { listPlayers } from '@/services/playersService'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * GET /api/players?sport=rugby&q=dupont
 *
 * Typeahead search, capped at 20 results. Both `sport` and `q` are required: without `q`
 * this would page the entire sport roster (~11k rows for football), which is what made
 * the game slow to start. Server-side callers that genuinely need the full roster use
 * `playersRepository.listBySport` directly.
 */
export async function GET(req: NextRequest) {
  const sport = req.nextUrl.searchParams.get('sport') ?? ''
  const q = req.nextUrl.searchParams.get('q') ?? ''

  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'sport is required and must be a valid SportId' }, { status: 400 })
  }

  if (q === '') {
    return NextResponse.json({ error: 'q is required' }, { status: 400 })
  }

  try {
    const players = await listPlayers(supabase, sport, q)
    return NextResponse.json(players)
  } catch (err) {
    return toErrorResponse(err)
  }
}
