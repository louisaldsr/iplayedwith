import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateConnection } from '@/services/validateService';
import { ValidationError } from '@/services/errors';
import { toErrorResponse } from '@/lib/apiErrors';

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
  try {
    const body = await req.json().catch(() => null);
    const playerAId = typeof body?.playerAId === 'string' ? body.playerAId : '';
    const playerBId = typeof body?.playerBId === 'string' ? body.playerBId : '';
    const clubId = typeof body?.clubId === 'string' ? body.clubId : undefined;
    const season = typeof body?.season === 'string' ? body.season : undefined;

    if (!playerAId || !playerBId) {
      throw new ValidationError('playerAId and playerBId are required');
    }

    const result = await validateConnection(supabase, { playerAId, playerBId, clubId, season });
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
