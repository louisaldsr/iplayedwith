import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'

/** POST /api/admin/clubs — body { name, sport, logoUrl? }. Rejects case-insensitive duplicate names within a sport. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const sport = body?.sport
  const logoUrl = typeof body?.logoUrl === 'string' && body.logoUrl.trim() ? body.logoUrl.trim() : null

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!isSportId(sport)) return NextResponse.json({ error: 'sport must be a valid SportId' }, { status: 400 })

  const db = supabaseAdmin()

  const { data: existing, error: lookupError } = await db
    .from('clubs')
    .select('id')
    .eq('sport', sport)
    .ilike('name', name)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (existing) {
    return NextResponse.json({ error: `A club named "${name}" already exists for ${sport}` }, { status: 409 })
  }

  const club = { id: randomUUID(), name, sport, logo_url: logoUrl }
  const { error } = await db.from('clubs').insert(club)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: club.id, name: club.name, sport: club.sport, logoUrl: club.logo_url }, { status: 201 })
}
