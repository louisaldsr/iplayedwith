import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/validate
 *
 * Easy mode:  { playerAId, playerBId }
 *   → returns the first shared membership (any club, any season)
 *
 * Hard mode:  { playerAId, playerBId, clubId, season }
 *   → checks that both players have that exact membership
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { playerAId, playerBId, clubId, season } = body;

  if (!playerAId || !playerBId) {
    return NextResponse.json({ error: 'playerAId and playerBId are required' }, { status: 400 });
  }

  if (clubId && season) {
    // Hard mode — exact membership check
    const { data, error } = await supabase
      .from('memberships')
      .select('player_id, club_id, season')
      .in('player_id', [playerAId, playerBId])
      .eq('club_id', clubId)
      .eq('season', season);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const playerIds = (data ?? []).map((m) => m.player_id);
    const valid = playerIds.includes(playerAId) && playerIds.includes(playerBId);

    return NextResponse.json({ valid, membership: valid ? { clubId, season } : null });
  }

  // Easy mode — find any shared club+season between the two players
  const { data: a, error: errA } = await supabase
    .from('memberships')
    .select('club_id, season')
    .eq('player_id', playerAId);

  const { data: b, error: errB } = await supabase
    .from('memberships')
    .select('club_id, season')
    .eq('player_id', playerBId);

  if (errA || errB) {
    return NextResponse.json({ error: errA?.message ?? errB?.message }, { status: 500 });
  }

  const setB = new Set((b ?? []).map((m) => `${m.club_id}|${m.season}`));
  const shared = (a ?? []).find((m) => setB.has(`${m.club_id}|${m.season}`));

  return NextResponse.json({
    valid: !!shared,
    membership: shared ? { clubId: shared.club_id, season: shared.season } : null,
  });
}
