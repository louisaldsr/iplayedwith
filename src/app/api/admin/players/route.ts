import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isSportId } from '@/domain/sport'

/** POST /api/admin/players — body { name, sport }. No duplicate-name guard: real people can share a name. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const sport = body?.sport

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!isSportId(sport)) return NextResponse.json({ error: 'sport must be a valid SportId' }, { status: 400 })

  const player = { id: randomUUID(), name, sport }
  const { error } = await supabaseAdmin().from('players').insert(player)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(player, { status: 201 })
}
