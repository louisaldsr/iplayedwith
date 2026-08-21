import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { upsertMemberships, deleteMembership, type MembershipRowInput } from '@/services/membershipsService'
import { ValidationError } from '@/services/errors'
import { toErrorResponse } from '@/lib/apiErrors'

function parseRow(raw: unknown, i: number): MembershipRowInput {
  const row = raw as { clubId?: unknown; season?: unknown; competition?: unknown }
  const clubId = typeof row?.clubId === 'string' ? row.clubId : ''
  if (!clubId) throw new ValidationError(`row ${i}: clubId is required`)
  const season = typeof row?.season === 'string' ? row.season : ''
  const competition = typeof row?.competition === 'string' && row.competition.trim() ? row.competition.trim() : undefined
  return { clubId, season, competition }
}

/**
 * POST /api/admin/memberships — body { playerId, memberships: { clubId, season, competition? }[] }.
 * Validates each season and that every referenced club plays the same sport as the player,
 * then upserts (re-submitting an already-saved season is a no-op, not an error).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
    if (!playerId) throw new ValidationError('playerId is required')

    const rawRows: unknown[] = Array.isArray(body?.memberships) ? body.memberships : []
    if (rawRows.length === 0) throw new ValidationError('memberships must be a non-empty array')

    const rows = rawRows.map(parseRow)
    const memberships = await upsertMemberships(supabaseAdmin(), playerId, rows)
    return NextResponse.json(memberships, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** DELETE /api/admin/memberships?playerId=&clubId=&season= — removes one membership row. */
export async function DELETE(req: NextRequest) {
  try {
    const playerId = req.nextUrl.searchParams.get('playerId')
    const clubId = req.nextUrl.searchParams.get('clubId')
    const season = req.nextUrl.searchParams.get('season')

    if (!playerId || !clubId || !season) {
      throw new ValidationError('playerId, clubId, and season are required')
    }

    await deleteMembership(supabaseAdmin(), playerId, clubId, season)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
