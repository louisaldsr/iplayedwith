import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listSeasonsForClub } from '@/services/membershipsService'
import { toErrorResponse } from '@/lib/apiErrors'

/**
 * GET /api/clubs/:id/seasons
 *
 * Seasons this club has a roster for, most recent first — the hard-mode season chips.
 * Hard mode used to derive these by filtering the full in-memory membership list.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const seasons = await listSeasonsForClub(supabase, id)
    return NextResponse.json(seasons)
  } catch (err) {
    return toErrorResponse(err)
  }
}
