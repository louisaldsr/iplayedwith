import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isSportId } from '@/domain/sport';
import { listMembershipsBySport } from '@/services/membershipsService';
import { toErrorResponse } from '@/lib/apiErrors';

/**
 * GET /api/memberships?sport=rugby
 *
 * Returns the full membership list for a sport (no pagination) — the
 * client-side GameEngine needs the complete graph up front to build paths.
 */
export async function GET(req: NextRequest) {
  const sport = req.nextUrl.searchParams.get('sport') ?? '';

  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'sport is required and must be a valid SportId' }, { status: 400 });
  }

  try {
    const memberships = await listMembershipsBySport(supabase, sport);
    return NextResponse.json(memberships);
  } catch (err) {
    return toErrorResponse(err);
  }
}
