import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Season } from '@/domain/season'

type MembershipInput = { clubId?: unknown; season?: unknown; competition?: unknown }

/**
 * POST /api/admin/memberships — body { playerId, memberships: { clubId, season, competition? }[] }.
 * Validates each season and that every referenced club plays the same sport as the player,
 * then upserts (re-submitting an already-saved season is a no-op, not an error).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
  const memberships: MembershipInput[] = Array.isArray(body?.memberships) ? body.memberships : []

  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  if (memberships.length === 0) {
    return NextResponse.json({ error: 'memberships must be a non-empty array' }, { status: 400 })
  }

  const db = supabaseAdmin()

  const { data: player, error: playerError } = await db
    .from('players')
    .select('id, sport')
    .eq('id', playerId)
    .maybeSingle()

  if (playerError) return NextResponse.json({ error: playerError.message }, { status: 500 })
  if (!player) return NextResponse.json({ error: `player "${playerId}" not found` }, { status: 404 })

  const rows: { player_id: string; club_id: string; season: string; competition: string | null }[] = []
  for (const [i, m] of memberships.entries()) {
    const clubId = typeof m.clubId === 'string' ? m.clubId : ''
    if (!clubId) return NextResponse.json({ error: `row ${i}: clubId is required` }, { status: 400 })
    const competition = typeof m.competition === 'string' && m.competition.trim() ? m.competition.trim() : null
    try {
      const season = Season(typeof m.season === 'string' ? m.season : '')
      rows.push({ player_id: playerId, club_id: clubId, season, competition })
    } catch (err) {
      return NextResponse.json({ error: `row ${i}: ${(err as Error).message}` }, { status: 400 })
    }
  }

  const clubIds = [...new Set(rows.map(r => r.club_id))]
  const { data: clubs, error: clubsError } = await db
    .from('clubs')
    .select('id, sport, name')
    .in('id', clubIds)

  if (clubsError) return NextResponse.json({ error: clubsError.message }, { status: 500 })

  const clubById = new Map((clubs ?? []).map(c => [c.id, c]))
  for (const clubId of clubIds) {
    const club = clubById.get(clubId)
    if (!club) return NextResponse.json({ error: `club "${clubId}" not found` }, { status: 404 })
    if (club.sport !== player.sport) {
      return NextResponse.json(
        { error: `club "${club.name}" plays ${club.sport}, but player is ${player.sport}` },
        { status: 400 },
      )
    }
  }

  const { data, error } = await db
    .from('memberships')
    .upsert(rows, { onConflict: 'player_id,club_id,season' })
    .select('player_id, club_id, season, competition')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    (data ?? []).map(r => ({ playerId: r.player_id, clubId: r.club_id, season: r.season, competition: r.competition })),
    { status: 201 },
  )
}

/** DELETE /api/admin/memberships?playerId=&clubId=&season= — removes one membership row. */
export async function DELETE(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  const clubId = req.nextUrl.searchParams.get('clubId')
  const season = req.nextUrl.searchParams.get('season')

  if (!playerId || !clubId || !season) {
    return NextResponse.json({ error: 'playerId, clubId, and season are required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin()
    .from('memberships')
    .delete()
    .eq('player_id', playerId)
    .eq('club_id', clubId)
    .eq('season', season)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
