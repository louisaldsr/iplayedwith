import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isSportId } from '@/domain/sport';

/**
 * GET /api/memberships?sport=rugby
 *
 * Returns the full membership list for a sport (no pagination) — the
 * client-side GameEngine needs the complete graph up front to build paths.
 * Scoped via the club's sport, since memberships itself carries no sport
 * column (it's implied transitively by playerId/clubId).
 */
export async function GET(req: NextRequest) {
  const sport = req.nextUrl.searchParams.get('sport') ?? '';

  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'sport is required and must be a valid SportId' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('memberships')
    .select('player_id, club_id, season, clubs!inner(sport)')
    .eq('clubs.sport', sport);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const memberships = (data ?? []).map((m) => ({
    playerId: m.player_id,
    clubId: m.club_id,
    season: m.season,
  }));

  return NextResponse.json(memberships);
}
