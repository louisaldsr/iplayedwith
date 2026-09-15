import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isSportId } from '@/domain/sport';
import { listClubs } from '@/services/clubsService';
import { toErrorResponse } from '@/lib/apiErrors';

/**
 * GET /api/clubs?sport=rugby&q=toulouse
 *
 * Typeahead search, capped at 20 results. Both `sport` and `q` are required — see the
 * players route for why the unbounded variant is no longer reachable from a browser.
 * The admin UI lists clubs through its own paginated endpoint.
 */
export async function GET(req: NextRequest) {
  const sport = req.nextUrl.searchParams.get('sport') ?? '';
  const q = req.nextUrl.searchParams.get('q') ?? '';

  if (!isSportId(sport)) {
    return NextResponse.json({ error: 'sport is required and must be a valid SportId' }, { status: 400 });
  }

  if (q === '') {
    return NextResponse.json({ error: 'q is required' }, { status: 400 });
  }

  try {
    const clubs = await listClubs(supabase, sport, q);
    return NextResponse.json(clubs);
  } catch (err) {
    return toErrorResponse(err);
  }
}
