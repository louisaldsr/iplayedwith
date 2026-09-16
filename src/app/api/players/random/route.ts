import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { PlayerId } from '@/domain/ids'
import { randomPlayer } from '@/services/playersService'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * GET /api/players/random?sport=rugby&exclude=<playerId>
 *
 * Backs the setup screen's "Randomize" button. `exclude` keeps it from returning the
 * player already chosen for the other slot.
 *
 * Picking server-side is the point: the client no longer holds the roster to pick from.
 */
export async function GET(req: NextRequest) {
  const sport = req.nextUrl.searchParams.get('sport') ?? ''
  const exclude = req.nextUrl.searchParams.get('exclude')

  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'sport is required and must be a valid SportId' }, { status: 400 })
  }

  try {
    const player = await randomPlayer(supabase, sport, exclude ? PlayerId(exclude) : undefined)
    if (!player) {
      return NextResponse.json({ error: `no players available for ${sport}` }, { status: 404 })
    }
    return NextResponse.json(player)
  } catch (err) {
    return toErrorResponse(err)
  }
}
