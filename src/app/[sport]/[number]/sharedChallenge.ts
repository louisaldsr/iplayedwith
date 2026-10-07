import { supabaseAdmin } from '@/lib/supabase'
import { SportId } from '@/domain/sport'
import { DailyChallenge } from '@/domain/dailyChallenge'
import { getSharedChallenge } from '@/services/dailyChallengeService'

/** "412" → 412; anything else — "0", "04", "abc" — is no challenge number. */
export function parseChallengeNumber(raw: string): number | null {
  return /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : null
}

/**
 * The challenge a shared link names, for its title and its card — or null when the number has none
 * yet, or the database cannot say. Both are only a preview: the link still opens today's challenge.
 */
export async function sharedChallengeOrNull(sport: SportId, number: number): Promise<DailyChallenge | null> {
  try {
    return await getSharedChallenge(supabaseAdmin(), sport, number)
  } catch (err) {
    console.error(`[share] could not read ${sport} challenge #${number}:`, err)
    return null
  }
}
