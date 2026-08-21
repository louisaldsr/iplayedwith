import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { createClub } from '@/services/clubsService'
import { toErrorResponse } from '@/lib/apiErrors'

/** POST /api/admin/clubs — body { name, sport, logoUrl? }. Rejects case-insensitive duplicate names within a sport. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const sport = body?.sport
  const logoUrl = typeof body?.logoUrl === 'string' && body.logoUrl.trim() ? body.logoUrl.trim() : null

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!isSportId(sport)) return NextResponse.json({ error: 'sport must be a valid SportId' }, { status: 400 })

  try {
    const club = await createClub(supabaseAdmin(), { name, sport, logoUrl })
    return NextResponse.json(club, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
