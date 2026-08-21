import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isSportId } from '@/domain/sport';
import { listClubs } from '@/services/clubsService';
import { toErrorResponse } from '@/lib/apiErrors';

/**
 * GET /api/clubs?sport=rugby&q=toulouse
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
    const clubs = await listClubs(supabase, sport, q);
    return NextResponse.json(clubs);
  } catch (err) {
    return toErrorResponse(err);
  }
}
