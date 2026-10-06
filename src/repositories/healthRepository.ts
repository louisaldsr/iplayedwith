import { SupabaseClient } from '@supabase/supabase-js'

/** How long the health check waits on the database before calling it down. */
const PING_TIMEOUT_MS = 5000

/**
 * One indexed read, the cheapest proof the database answers — what an uptime monitor pings every
 * few minutes. Throws when it does not (error or timeout).
 */
export async function ping(db: SupabaseClient): Promise<void> {
  const { error } = await db.from('players').select('id').limit(1).abortSignal(AbortSignal.timeout(PING_TIMEOUT_MS))
  if (error) throw new Error(error.message)
}
