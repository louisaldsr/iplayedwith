import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isSportId } from '@/domain/sport';
import { listPlayers } from '@/services/playersService';
import { toErrorResponse } from '@/lib/apiErrors';

/**
 * GET /api/players?sport=rugby&q=dupont
 *
 * `sport` is required. `q` is an optional case-insensitive name filter
 * capped at 20 results (typeahead); omit it to get the full sport roster.
 */
export async function GET(req: NextRequest) {
  const sport = req.nextUrl.searchParams.get('sport') ?? '';
  const q = req.nextUrl.searchParams.get('q') ?? '';

  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'sport is required and must be a valid SportId' }, { status: 400 });
  }

  try {
    const players = await listPlayers(supabase, sport, q);
    return NextResponse.json(players);
  } catch (err) {
    return toErrorResponse(err);
  }
}
