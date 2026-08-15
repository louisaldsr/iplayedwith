import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isSportId } from '@/domain/sport';

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

  let query = supabase
    .from('players')
    .select('id, name, sport')
    .eq('sport', sport)
    .order('name');

  if (q) query = query.ilike('name', `%${q}%`).limit(20);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
