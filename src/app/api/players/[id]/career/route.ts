import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { PlayerId } from '@/domain/ids'
import { getPlayerCareer } from '@/services/careerService'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * GET /api/players/:id/career
 *
 * `{ player, stints }` — the player's clubs, grouped into runs of consecutive seasons, oldest
 * first. Opened from the daily challenge's player cards, so a user who does not know a player
 * can read where he played.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    return NextResponse.json(await getPlayerCareer(supabase, PlayerId(id)))
  } catch (err) {
    return toErrorResponse(err)
  }
}
