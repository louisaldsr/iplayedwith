import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'
import { Nationality } from '@/domain/nationality'
import { createPlayer } from '@/services/playersService'
import { toErrorResponse } from '@/lib/apiErrors'

/** POST /api/admin/players — body { name, sport, nationality? }. No duplicate-name guard: real people can share a name. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const sport = body?.sport
  const nationality = typeof body?.nationality === 'string' ? body.nationality.trim() : undefined

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!isSportId(sport)) return NextResponse.json({ error: 'sport must be a valid SportId' }, { status: 400 })
  if (nationality) {
    try {
      Nationality(nationality)
    } catch {
      return NextResponse.json(
        { error: 'nationality must be a valid country code (e.g. FR) or UK home-nation code (GB-ENG, GB-SCT, GB-WLS, GB-NIR)' },
        { status: 400 },
      )
    }
  }

  try {
    const player = await createPlayer(supabaseAdmin(), { name, sport, nationality })
    return NextResponse.json(player, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
